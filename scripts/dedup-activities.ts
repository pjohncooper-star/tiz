/**
 * Merge duplicate SyncedActivity rows for one athlete (e.g. bulk import + Strava).
 *
 * Usage:
 *   $env:DATABASE_URL='postgresql://...'
 *   npx tsx scripts/dedup-activities.ts user@example.com --dry-run
 *   npx tsx scripts/dedup-activities.ts user@example.com --confirm
 */
import "dotenv/config";
import type { ActivitySource, SyncedActivity } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { activitiesFuzzyMatch } from "../src/lib/activity/match";

type ActivityRow = SyncedActivity & {
  _count: { zoneBreakdowns: number };
  surveyResponse: { id: string } | null;
};

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

function unionFindParent(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) !== root) {
    root = parent.get(root)!;
  }
  let cursor = id;
  while (cursor !== root) {
    const next = parent.get(cursor)!;
    parent.set(cursor, root);
    cursor = next;
  }
  return root;
}

function union(parent: Map<string, string>, a: string, b: string) {
  const ra = unionFindParent(parent, a);
  const rb = unionFindParent(parent, b);
  if (ra !== rb) parent.set(rb, ra);
}

function clusterActivities(activities: ActivityRow[]): ActivityRow[][] {
  const parent = new Map<string, string>();
  for (const a of activities) parent.set(a.id, a.id);

  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const ai = activities[i]!;
      const aj = activities[j]!;
      if (
        activitiesFuzzyMatch(
          {
            discipline: ai.discipline,
            startTime: ai.startTime,
            durationSeconds: ai.durationSeconds,
            distanceMeters: ai.distanceMeters,
            externalId: ai.externalId,
          },
          {
            discipline: aj.discipline,
            startTime: aj.startTime,
            durationSeconds: aj.durationSeconds,
            distanceMeters: aj.distanceMeters,
            externalId: aj.externalId,
          }
        )
      ) {
        union(parent, ai.id, aj.id);
      }
    }
  }

  const groups = new Map<string, ActivityRow[]>();
  for (const a of activities) {
    const root = unionFindParent(parent, a.id);
    const list = groups.get(root) ?? [];
    list.push(a);
    groups.set(root, list);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

function sourceRank(source: ActivitySource): number {
  if (source === "BULK_IMPORT") return 2;
  if (source === "STRAVA_LIVE") return 1;
  return 0;
}

function pickKeeper(cluster: ActivityRow[]): ActivityRow {
  return [...cluster].sort((a, b) => {
    const zoneDelta = b._count.zoneBreakdowns - a._count.zoneBreakdowns;
    if (zoneDelta !== 0) return zoneDelta;
    const sourceDelta = sourceRank(b.source) - sourceRank(a.source);
    if (sourceDelta !== 0) return sourceDelta;
    if (a.surveyResponse && !b.surveyResponse) return -1;
    if (b.surveyResponse && !a.surveyResponse) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

async function repointAndDelete(
  db: PrismaClient,
  keeperId: string,
  duplicateId: string
) {
  await db.surveyResponse.updateMany({
    where: { activityId: duplicateId },
    data: { activityId: keeperId },
  });

  const dupLink = await db.plannedSession.findFirst({
    where: { linkedActivityId: duplicateId },
    select: { id: true },
  });
  if (dupLink) {
    const keeperTaken = await db.plannedSession.findFirst({
      where: { linkedActivityId: keeperId },
      select: { id: true },
    });
    if (!keeperTaken) {
      await db.plannedSession.update({
        where: { id: dupLink.id },
        data: { linkedActivityId: keeperId },
      });
    } else {
      await db.plannedSession.update({
        where: { id: dupLink.id },
        data: { linkedActivityId: null },
      });
    }
  }

  await db.zoneBreakdown.deleteMany({ where: { activityId: duplicateId } });
  await db.syncedActivity.delete({ where: { id: duplicateId } });
}

async function main() {
  const email = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  const confirm = process.argv.includes("--confirm");

  if (!email) {
    console.error(
      "Usage: npx tsx scripts/dedup-activities.ts <email> --dry-run | --confirm"
    );
    process.exit(1);
  }
  if (!dryRun && !confirm) {
    console.error("Pass --dry-run or --confirm.");
    process.exit(1);
  }

  const db = makeClient();
  try {
    const user = await db.user.findUnique({
      where: { email },
      include: { athlete: { select: { id: true } } },
    });
    if (!user?.athlete) {
      console.error(`No athlete for ${email}`);
      process.exit(1);
    }

    const athleteId = user.athlete.id;
    const activities = await db.syncedActivity.findMany({
      where: { athleteId },
      include: {
        _count: { select: { zoneBreakdowns: true } },
        surveyResponse: { select: { id: true } },
      },
      orderBy: { startTime: "asc" },
    });

    const clusters = clusterActivities(activities);
    if (clusters.length === 0) {
      console.log("No duplicate clusters found.");
      return;
    }

    let deleteCount = 0;
    for (const cluster of clusters) {
      const keeper = pickKeeper(cluster);
      const duplicates = cluster.filter((a) => a.id !== keeper.id);
      console.log(
        `\nCluster ${keeper.startTime.toISOString().slice(0, 16)} ${keeper.discipline}: keeper ${keeper.id} (${keeper.source}, zones ${keeper._count.zoneBreakdowns})`
      );
      for (const dup of duplicates) {
        console.log(
          `  duplicate ${dup.id} (${dup.source}, zones ${dup._count.zoneBreakdowns})`
        );
        if (confirm) {
          await repointAndDelete(db, keeper.id, dup.id);
        }
        deleteCount++;
      }
    }

    console.log(
      `\n${dryRun ? "Would remove" : "Removed"} ${deleteCount} duplicate activities in ${clusters.length} clusters.`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
