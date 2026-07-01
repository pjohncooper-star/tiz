/**
 * Copy a user + full athlete graph from SOURCE_DATABASE_URL to TARGET_DATABASE_URL.
 *
 * Prefer direct Neon connection strings (not -pooler) for long runs.
 *
 * Full migration (deletes target user if present, copies everything):
 *   $env:SOURCE_DATABASE_URL='postgresql://...direct...'
 *   $env:TARGET_DATABASE_URL='postgresql://...direct...'
 *   npx tsx scripts/migrate-user-to-prod.ts user@example.com --confirm
 *
 * Resume (after a partial migration — skips user/activities/zones already on target):
 *   npx tsx scripts/migrate-user-to-prod.ts user@example.com --resume
 */
import "dotenv/config";
import type { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaClientCtor } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deleteUserByEmail } from "./lib/delete-user-graph";
import {
  copyManyBatched,
  DEFAULT_BATCH_SIZE,
  rowsMissingById,
} from "./lib/migrate-copy";

function host(url: string): string {
  return url.match(/@([^/]+)/)?.[1] ?? "unknown";
}

function makeClient(connectionString: string): PrismaClient {
  return new PrismaClientCtor({ adapter: new PrismaNeon({ connectionString }) });
}

async function countActivities(db: PrismaClient, athleteId: string): Promise<number> {
  return db.syncedActivity.count({ where: { athleteId } });
}

async function countZoneBreakdowns(db: PrismaClient, athleteId: string): Promise<number> {
  return db.zoneBreakdown.count({
    where: { activity: { athleteId } },
  });
}

async function activityIds(db: PrismaClient, athleteId: string): Promise<string[]> {
  const rows = await db.syncedActivity.findMany({
    where: { athleteId },
    select: { id: true },
  });
  return rows.map((a) => a.id);
}

async function applyFkFixups(
  source: PrismaClient,
  target: PrismaClient,
  athleteId: string
) {
  const seasonPlans = await source.seasonPlan.findMany({ where: { athleteId } });
  for (const plan of seasonPlans) {
    if (plan.primaryGoalEventId) {
      await target.seasonPlan.update({
        where: { id: plan.id },
        data: { primaryGoalEventId: plan.primaryGoalEventId },
      });
    }
  }

  const goalEvents = await source.goalEvent.findMany({ where: { athleteId } });
  for (const event of goalEvents) {
    if (event.plannedSessionId) {
      await target.goalEvent.update({
        where: { id: event.id },
        data: { plannedSessionId: event.plannedSessionId },
      });
    }
  }
  console.log("  FK fixups: season plans + goal events");
}

async function copyMissingZoneBreakdowns(
  source: PrismaClient,
  target: PrismaClient,
  athleteId: string
) {
  const ids = await activityIds(source, athleteId);
  const sourceRows = await source.zoneBreakdown.findMany({
    where: { activityId: { in: ids } },
  });
  const existing = new Set(
    (
      await target.zoneBreakdown.findMany({
        where: { activityId: { in: ids } },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  const missing = rowsMissingById(sourceRows, existing);
  if (missing.length === 0) {
    console.log(`  ZoneBreakdown: complete (${sourceRows.length} on source)`);
    return;
  }
  console.log(`  ZoneBreakdown: copying ${missing.length} missing rows...`);
  await copyManyBatched("ZoneBreakdown", missing, DEFAULT_BATCH_SIZE, async (batch) => {
    const result = await target.zoneBreakdown.createMany({
      data: batch,
      skipDuplicates: true,
    });
    return result.count;
  });
}

async function copyTailTables(
  source: PrismaClient,
  target: PrismaClient,
  athleteId: string
) {
  const surveySource = await source.surveyResponse.findMany({ where: { athleteId } });
  const surveyExisting = new Set(
    (
      await target.surveyResponse.findMany({
        where: { athleteId },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  await copyManyBatched(
    "SurveyResponse",
    rowsMissingById(surveySource, surveyExisting),
    DEFAULT_BATCH_SIZE,
    async (batch) => {
      const result = await target.surveyResponse.createMany({
        data: batch,
        skipDuplicates: true,
      });
      return result.count;
    }
  );

  const plannedSource = await source.plannedSession.findMany({ where: { athleteId } });
  const plannedExisting = new Set(
    (
      await target.plannedSession.findMany({
        where: { athleteId },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  await copyManyBatched(
    "PlannedSession",
    rowsMissingById(plannedSource, plannedExisting),
    DEFAULT_BATCH_SIZE,
    async (batch) => {
      const result = await target.plannedSession.createMany({
        data: batch as Prisma.PlannedSessionCreateManyInput[],
        skipDuplicates: true,
      });
      return result.count;
    }
  );

  const structuredSource = await source.structuredWorkout.findMany({ where: { athleteId } });
  const structuredExisting = new Set(
    (
      await target.structuredWorkout.findMany({
        where: { athleteId },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  await copyManyBatched(
    "StructuredWorkout",
    rowsMissingById(structuredSource, structuredExisting),
    DEFAULT_BATCH_SIZE,
    async (batch) => {
      const result = await target.structuredWorkout.createMany({
        data: batch as Prisma.StructuredWorkoutCreateManyInput[],
        skipDuplicates: true,
      });
      return result.count;
    }
  );

  const insightSource = await source.interactionInsight.findMany({ where: { athleteId } });
  const insightExisting = new Set(
    (
      await target.interactionInsight.findMany({
        where: { athleteId },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  await copyManyBatched(
    "InteractionInsight",
    rowsMissingById(insightSource, insightExisting),
    DEFAULT_BATCH_SIZE,
    async (batch) => {
      const result = await target.interactionInsight.createMany({
        data: batch,
        skipDuplicates: true,
      });
      return result.count;
    }
  );

  const stravaSource = await source.stravaConnection.findUnique({ where: { athleteId } });
  const stravaTarget = await target.stravaConnection.findUnique({ where: { athleteId } });
  if (stravaSource && !stravaTarget) {
    await target.stravaConnection.create({ data: stravaSource });
    console.log("  StravaConnection: 1");
  } else if (stravaSource && stravaTarget) {
    console.log("  StravaConnection: already present");
  } else {
    console.log("  StravaConnection: none on source (reconnect on prod)");
  }
}

async function resumeMigration(
  source: PrismaClient,
  target: PrismaClient,
  email: string
) {
  const sourceUser = await source.user.findUnique({
    where: { email },
    include: { athlete: true },
  });
  if (!sourceUser?.athlete) {
    console.error(`No user/athlete on source for ${email}`);
    process.exit(1);
  }

  const targetUser = await target.user.findUnique({
    where: { email },
    include: { athlete: true },
  });
  if (!targetUser?.athlete) {
    console.error(
      `No user/athlete on target for ${email}. Run full migration with --confirm first.`
    );
    process.exit(1);
  }

  const athleteId = sourceUser.athlete.id;
  if (targetUser.athlete.id !== athleteId) {
    console.error(
      `Athlete ID mismatch (source ${athleteId}, target ${targetUser.athlete.id}). ` +
        "Resume requires the same IDs from a prior partial full migration."
    );
    process.exit(1);
  }

  const sourceActivities = await countActivities(source, athleteId);
  const targetActivities = await countActivities(target, athleteId);
  if (sourceActivities !== targetActivities) {
    console.error(
      `SyncedActivity count mismatch (source ${sourceActivities}, target ${targetActivities}). ` +
        "Fix partial state or run full migration with --confirm."
    );
    process.exit(1);
  }
  console.log(`SyncedActivity: ${targetActivities} (matches source)`);

  const sourceZones = await countZoneBreakdowns(source, athleteId);
  const targetZones = await countZoneBreakdowns(target, athleteId);
  console.log(`ZoneBreakdown: source ${sourceZones}, target ${targetZones}`);

  if (targetZones < sourceZones) {
    await copyMissingZoneBreakdowns(source, target, athleteId);
  } else if (targetZones > sourceZones) {
    console.warn(
      `  Warning: target has more zone rows than source (${targetZones} > ${sourceZones}); skipping zone copy.`
    );
  } else {
    console.log("  ZoneBreakdown: complete");
  }

  await copyTailTables(source, target, athleteId);
  await applyFkFixups(source, target, athleteId);

  console.log(`\nResume done for ${email}. Sign in at https://www.tizplanner.com`);
}

async function fullMigration(
  source: PrismaClient,
  target: PrismaClient,
  email: string
) {
  const user = await source.user.findUnique({
    where: { email },
    include: { athlete: true },
  });
  if (!user?.athlete) {
    console.error(`No user/athlete on source for ${email}`);
    process.exit(1);
  }

  const athleteId = user.athlete.id;
  const athlete = user.athlete;

  const existing = await target.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Removing existing target user ${email}...`);
    await deleteUserByEmail(target, email);
  }

  const { athlete: _athlete, ...userData } = user;

  await target.user.create({ data: userData });
  await target.athlete.create({ data: athlete });
  console.log(`Copied User + Athlete (${athleteId}).`);

  const copy = async <T extends { id: string }>(
    label: string,
    fetch: () => Promise<T[]>,
    insert: (row: T) => Promise<unknown>
  ) => {
    const rows = await fetch();
    for (const row of rows) await insert(row);
    console.log(`  ${label}: ${rows.length}`);
  };

  await copy(
    "AthleteDisciplineSettings",
    () => source.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    (r) => target.athleteDisciplineSettings.create({ data: r })
  );
  await copy(
    "SignalPreference",
    () => source.signalPreference.findMany({ where: { athleteId } }),
    (r) => target.signalPreference.create({ data: r })
  );
  await copy(
    "ThresholdProfile",
    () => source.thresholdProfile.findMany({ where: { athleteId } }),
    (r) => target.thresholdProfile.create({ data: r })
  );
  await copy(
    "ImportJob",
    () => source.importJob.findMany({ where: { athleteId } }),
    (r) => target.importJob.create({ data: r })
  );
  await copy(
    "WorkoutFolder",
    () => source.workoutFolder.findMany({ where: { athleteId } }),
    (r) => target.workoutFolder.create({ data: r })
  );
  await copy(
    "WorkoutTemplate",
    () => source.workoutTemplate.findMany({ where: { athleteId } }),
    (r) => target.workoutTemplate.create({ data: r })
  );
  await copy(
    "ReusableSegment",
    () => source.reusableSegment.findMany({ where: { athleteId } }),
    (r) => target.reusableSegment.create({ data: r })
  );

  const seasonPlans = await source.seasonPlan.findMany({ where: { athleteId } });
  for (const plan of seasonPlans) {
    const { primaryGoalEventId, ...planData } = plan;
    await target.seasonPlan.create({
      data: { ...planData, primaryGoalEventId: null },
    });
  }
  console.log(`  SeasonPlan: ${seasonPlans.length}`);

  const seasonPlanIds = seasonPlans.map((p) => p.id);
  const phases = await source.seasonPhase.findMany({
    where: { seasonPlanId: { in: seasonPlanIds } },
  });
  for (const row of phases) await target.seasonPhase.create({ data: row });
  console.log(`  SeasonPhase: ${phases.length}`);

  const phaseIds = phases.map((p) => p.id);
  await copy(
    "SeasonPhaseDiscipline",
    () =>
      source.seasonPhaseDiscipline.findMany({
        where: { phaseId: { in: phaseIds } },
      }),
    (r) => target.seasonPhaseDiscipline.create({ data: r })
  );
  await copy(
    "SeasonMesocycle",
    () =>
      source.seasonMesocycle.findMany({ where: { phaseId: { in: phaseIds } } }),
    (r) => target.seasonMesocycle.create({ data: r })
  );
  await copy(
    "SeasonWeek",
    () =>
      source.seasonWeek.findMany({ where: { seasonPlanId: { in: seasonPlanIds } } }),
    (r) => target.seasonWeek.create({ data: r })
  );

  const goalEvents = await source.goalEvent.findMany({ where: { athleteId } });
  for (const event of goalEvents) {
    const { plannedSessionId, ...eventData } = event;
    await target.goalEvent.create({
      data: { ...eventData, plannedSessionId: null },
    });
  }
  console.log(`  GoalEvent: ${goalEvents.length}`);

  const weeklyTemplate = await source.weeklyScheduleTemplate.findUnique({
    where: { athleteId },
    include: { items: true },
  });
  if (weeklyTemplate) {
    const { items, athlete: _at, ...templateData } = weeklyTemplate;
    await target.weeklyScheduleTemplate.create({ data: templateData });
    for (const item of items) {
      await target.weeklyScheduleTemplateItem.create({ data: item });
    }
    console.log(`  WeeklyScheduleTemplate: 1 (${items.length} items)`);
  }

  await copy(
    "AnchorWorkout",
    () => source.anchorWorkout.findMany({ where: { athleteId } }),
    (r) => target.anchorWorkout.create({ data: r })
  );
  await copy(
    "SyncedActivity",
    () => source.syncedActivity.findMany({ where: { athleteId } }),
    (r) => target.syncedActivity.create({ data: r })
  );

  const ids = await activityIds(source, athleteId);
  const zoneRows = await source.zoneBreakdown.findMany({
    where: { activityId: { in: ids } },
  });
  await copyManyBatched("ZoneBreakdown", zoneRows, DEFAULT_BATCH_SIZE, async (batch) => {
    const result = await target.zoneBreakdown.createMany({
      data: batch,
      skipDuplicates: true,
    });
    return result.count;
  });

  await copyTailTables(source, target, athleteId);
  await applyFkFixups(source, target, athleteId);

  console.log(`\nDone. Sign in at https://www.tizplanner.com with ${email} and your local password.`);
}

async function main() {
  const email = process.argv[2];
  const confirm = process.argv.includes("--confirm");
  const resume = process.argv.includes("--resume");

  if (!email) {
    console.error(
      "Usage: npx tsx scripts/migrate-user-to-prod.ts <email> --confirm | --resume"
    );
    process.exit(1);
  }
  if (confirm && resume) {
    console.error("Pass only one of --confirm or --resume.");
    process.exit(1);
  }
  if (!confirm && !resume) {
    console.error("Pass --confirm (full migration) or --resume (tail tables only).");
    process.exit(1);
  }

  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    console.error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.");
    process.exit(1);
  }

  console.log(`Mode: ${resume ? "resume" : "full"}`);
  console.log(`Source: ${host(sourceUrl)}`);
  console.log(`Target: ${host(targetUrl)}`);

  const source = makeClient(sourceUrl);
  const target = makeClient(targetUrl);

  try {
    if (resume) {
      await resumeMigration(source, target, email);
    } else {
      await fullMigration(source, target, email);
    }
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
