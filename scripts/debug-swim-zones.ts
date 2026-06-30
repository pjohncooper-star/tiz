import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { parseStoredStreams } from "../src/lib/zones/process-activity";
import { computeZoneBreakdown } from "../src/lib/zones/compute";
import { getThresholdProfileAtDate } from "../src/lib/zones/thresholds";
import { parseZoneBoundaries } from "../src/lib/zones/thresholds";
import { velocityToPaceSecPer100m } from "../src/lib/units/pace";
import { normalizeStreamsForZones } from "../src/lib/zones/normalize-streams";
import { buildPoolSwimLapPaceStreams } from "../src/lib/import/swim-laps";
import { resolveSampleDurations } from "../src/lib/zones/sample-time";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

function assignZone(
  value: number,
  threshold: number,
  boundaries: number[],
  signal: "PACE"
): number {
  const pct = (threshold / value) * 100;
  const sorted = [...boundaries].sort((a, b) => a - b);
  let zone = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (pct >= sorted[i]) zone = i + 2;
  }
  return Math.min(zone, sorted.length + 1);
}

async function main() {
  const id = process.argv[2] ?? "cmqph4ves00178w98iug0hv77";
  const activity = await db.syncedActivity.findUnique({ where: { id } });
  if (!activity) throw new Error("not found");

  const raw = parseStoredStreams(activity.rawStreams);
  const streams = normalizeStreamsForZones(raw, activity.durationSeconds);
  const profile = await getThresholdProfileAtDate(
    activity.athleteId,
    "SWIM",
    "PACE",
    activity.startTime
  );
  if (!profile) throw new Error("no profile");

  const boundaries = parseZoneBoundaries(profile.zoneBoundaries);
  console.log("threshold sec/100m:", profile.thresholdValue);
  console.log("boundaries:", boundaries);

  const lapStreams = buildPoolSwimLapPaceStreams(raw.swimLaps?.data ?? []);
  const vel = lapStreams?.velocity?.data ?? [];
  const durations = resolveSampleDurations(
    streams,
    activity.durationSeconds,
    "PACE"
  );

  console.log("\n=== LAP PACE ZONES ===");
  for (let i = 0; i < vel.length; i++) {
    const pace = velocityToPaceSecPer100m(vel[i])!;
    const zone = assignZone(pace, profile.thresholdValue, boundaries, "PACE");
    console.log(
      `  lap ${i + 1}: pace ${pace.toFixed(1)} Z${zone} dur ${durations[i]?.toFixed(0)}s`
    );
  }

  console.log(
    "zones:",
    computeZoneBreakdown(streams, profile, "SWIM", activity.durationSeconds)
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
