import "dotenv/config";
import fs from "fs";
import { gunzipSync } from "fflate";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
// Run with: npx tsx scripts/reimport-fit-activity.mjs ...
import { parseFitFile } from "../src/lib/import/fit.ts";
import { computeActivityZones } from "../src/lib/zones/process-activity.ts";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2];
const activityId = process.argv[3];
const fitPath = process.argv[4];

if (!email || !activityId || !fitPath) {
  console.error(
    "Usage: node scripts/reimport-fit-activity.mjs <email> <activityId> <path-to.fit|.fit.gz>"
  );
  process.exit(1);
}

const athlete = await db.athlete.findFirst({
  where: { user: { email } },
  select: { id: true },
});
if (!athlete) {
  console.error("Athlete not found for", email);
  process.exit(1);
}

const existing = await db.syncedActivity.findFirst({
  where: { id: activityId, athleteId: athlete.id },
});
if (!existing) {
  console.error("Activity not found:", activityId);
  process.exit(1);
}

let bytes = fs.readFileSync(fitPath);
if (fitPath.toLowerCase().endsWith(".gz")) {
  bytes = gunzipSync(bytes);
}

const parsed = parseFitFile(new Uint8Array(bytes), fitPath.split(/[/\\]/).pop() ?? "activity.fit");
if (parsed.length === 0) {
  console.error("No recorded activity parsed from file. Run scripts/debug-fit-file.mjs first.");
  process.exit(1);
}

const match =
  parsed.find(
    (p) =>
      Math.abs(p.startTime.getTime() - existing.startTime.getTime()) < 120_000
  ) ?? parsed[0];

const streamKeys = Object.keys(match.streams);
console.log("Parsed:", match.name, match.startTime.toISOString(), match.durationSeconds + "s");
console.log("Streams:", streamKeys.join(", ") || "(none)");

await db.syncedActivity.update({
  where: { id: activityId },
  data: {
    name: match.name,
    discipline: match.discipline,
    startTime: match.startTime,
    durationSeconds: match.durationSeconds,
    distanceMeters: match.distanceMeters,
    rawStreams: match.streams,
    streamsFetched: true,
    zoneComputed: false,
    noUsableSignal: false,
  },
});

await db.zoneBreakdown.deleteMany({ where: { activityId } });
await computeActivityZones(activityId);

const updated = await db.syncedActivity.findUnique({
  where: { id: activityId },
  include: { zoneBreakdowns: true },
});

console.log(
  "Updated:",
  updated?.name,
  "zoneComputed:",
  updated?.zoneComputed,
  "noUsableSignal:",
  updated?.noUsableSignal,
  "zones:",
  updated?.zoneBreakdowns.length ?? 0
);

await db.$disconnect();
