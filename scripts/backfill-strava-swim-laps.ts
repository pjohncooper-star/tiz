/**
 * Re-fetch Strava lap data for existing STRAVA_LIVE swims and recompute TiZ zones.
 *
 * Usage:
 *   $env:DATABASE_URL='postgresql://...'
 *   $env:STRAVA_CLIENT_ID='...'
 *   $env:STRAVA_CLIENT_SECRET='...'
 *   npx tsx scripts/backfill-strava-swim-laps.ts user@example.com --dry-run
 *   npx tsx scripts/backfill-strava-swim-laps.ts user@example.com --confirm
 *   npx tsx scripts/backfill-strava-swim-laps.ts --confirm --all-athletes
 */
import "dotenv/config";
import type { NormalizedStreams } from "../src/lib/zones/compute";
import {
  computeActivityZones,
  parseStoredStreams,
} from "../src/lib/zones/process-activity";
import { refreshStravaToken } from "../src/lib/strava/client";
import {
  fetchStravaActivityLaps,
  mapStravaLapsToSwimLaps,
} from "../src/lib/strava/laps";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const LAP_FETCH_DELAY_MS = 250;

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function needsSwimLapBackfill(rawStreams: unknown): boolean {
  const streams = parseStoredStreams(rawStreams);
  const active =
    streams.swimLaps?.data?.filter((lap) => lap.speedMps > 0) ?? [];
  return active.length < 3;
}

async function getStravaAccessToken(
  db: PrismaClient,
  athleteId: string
): Promise<string | null> {
  const conn = await db.stravaConnection.findUnique({ where: { athleteId } });
  if (!conn) return null;

  if (conn.expiresAt > new Date()) return conn.accessToken;

  const refreshed = await refreshStravaToken(conn.refreshToken);
  await db.stravaConnection.update({
    where: { athleteId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(refreshed.expires_at * 1000),
    },
  });
  return refreshed.access_token;
}

async function backfillActivity(
  db: PrismaClient,
  activity: {
    id: string;
    athleteId: string;
    externalId: string | null;
    startTime: Date;
    rawStreams: unknown;
    name: string;
  },
  token: string,
  confirm: boolean
): Promise<"updated" | "skipped" | "failed"> {
  const stravaId = Number(activity.externalId);
  if (!Number.isFinite(stravaId) || stravaId <= 0) {
    console.log(`  skip ${activity.id} (${activity.name}): no Strava externalId`);
    return "skipped";
  }

  if (!needsSwimLapBackfill(activity.rawStreams)) {
    console.log(`  skip ${activity.id} (${activity.name}): swimLaps already usable`);
    return "skipped";
  }

  let laps;
  try {
    laps = await fetchStravaActivityLaps(stravaId, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  fail ${activity.id} (${activity.name}): ${message}`);
    return "failed";
  }

  const swimLaps = mapStravaLapsToSwimLaps(laps, activity.startTime);
  if (!swimLaps) {
    console.log(`  skip ${activity.id} (${activity.name}): Strava returned no usable laps`);
    return "skipped";
  }

  const active = swimLaps.filter((lap) => lap.speedMps > 0).length;
  console.log(
    `  ${confirm ? "update" : "would update"} ${activity.id} (${activity.name}): ${swimLaps.length} laps (${active} active)`
  );

  if (!confirm) return "updated";

  const prev = parseStoredStreams(activity.rawStreams);
  const merged: NormalizedStreams = {
    ...prev,
    swimLaps: { data: swimLaps },
  };

  await db.syncedActivity.update({
    where: { id: activity.id },
    data: {
      rawStreams: merged,
      zoneComputed: false,
      noUsableSignal: false,
    },
  });
  await db.zoneBreakdown.deleteMany({ where: { activityId: activity.id } });
  await computeActivityZones(activity.id);

  return "updated";
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirm = args.includes("--confirm");
  const allAthletes = args.includes("--all-athletes");
  const email = args.find((arg) => !arg.startsWith("--"));

  if (!dryRun && !confirm) {
    console.error("Pass --dry-run or --confirm.");
    process.exit(1);
  }
  if (!email && !allAthletes) {
    console.error(
      "Usage: npx tsx scripts/backfill-strava-swim-laps.ts <email> --dry-run | --confirm"
    );
    console.error(
      "   or: npx tsx scripts/backfill-strava-swim-laps.ts --all-athletes --confirm"
    );
    process.exit(1);
  }

  const db = makeClient();
  const stats = { updated: 0, skipped: 0, failed: 0, noToken: 0 };

  try {
    let athleteIds: string[] = [];

    if (allAthletes) {
      const connections = await db.stravaConnection.findMany({
        select: { athleteId: true },
      });
      athleteIds = connections.map((c) => c.athleteId);
      console.log(`Athletes with Strava: ${athleteIds.length}`);
    } else {
      const user = await db.user.findUnique({
        where: { email },
        include: { athlete: { select: { id: true } } },
      });
      if (!user?.athlete) {
        console.error(`No athlete for ${email}`);
        process.exit(1);
      }
      athleteIds = [user.athlete.id];
    }

    for (const athleteId of athleteIds) {
      const token = await getStravaAccessToken(db, athleteId);
      if (!token) {
        console.log(`\nAthlete ${athleteId}: no Strava connection — skipping`);
        stats.noToken++;
        continue;
      }

      const activities = await db.syncedActivity.findMany({
        where: {
          athleteId,
          discipline: "SWIM",
          source: "STRAVA_LIVE",
          externalId: { not: null },
        },
        select: {
          id: true,
          athleteId: true,
          externalId: true,
          startTime: true,
          rawStreams: true,
          name: true,
        },
        orderBy: { startTime: "desc" },
      });

      const candidates = activities.filter((a) =>
        needsSwimLapBackfill(a.rawStreams)
      );

      console.log(
        `\nAthlete ${athleteId}: ${candidates.length}/${activities.length} Strava swims need lap backfill`
      );

      for (const activity of candidates) {
        const result = await backfillActivity(
          db,
          activity,
          token,
          confirm
        );
        stats[result]++;
        if (confirm) await sleep(LAP_FETCH_DELAY_MS);
      }
    }

    console.log(
      `\nDone (${dryRun ? "dry-run" : "applied"}): updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed} noToken=${stats.noToken}`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
