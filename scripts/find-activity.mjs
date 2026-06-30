import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2] ?? "pjohncooper@gmail.com";
const targetDay = process.argv[3] ?? "2023-06-25";

const user = await db.user.findUnique({
  where: { email },
  include: { athlete: true },
});

if (!user?.athlete) process.exit(1);
const athleteId = user.athlete.id;

function localKey(d) {
  return format(d, "yyyy-MM-dd");
}

// API-style filter (server local TZ)
const day = parseISO(targetDay);
const apiStart = startOfDay(day);
const apiEnd = endOfDay(day);

const apiMatches = await db.syncedActivity.findMany({
  where: {
    athleteId,
    startTime: { gte: apiStart, lte: apiEnd },
  },
  include: { surveyResponse: true },
  orderBy: { startTime: "asc" },
});

// UTC calendar day
const utcStart = new Date(`${targetDay}T00:00:00.000Z`);
const utcEnd = new Date(`${targetDay}T23:59:59.999Z`);
const utcMatches = await db.syncedActivity.findMany({
  where: {
    athleteId,
    startTime: { gte: utcStart, lte: utcEnd },
  },
  orderBy: { startTime: "asc" },
});

// Wide window Jun 24-26
const wide = await db.syncedActivity.findMany({
  where: {
    athleteId,
    startTime: {
      gte: new Date("2023-06-24T00:00:00.000Z"),
      lte: new Date("2023-06-26T23:59:59.999Z"),
    },
  },
  orderBy: { startTime: "asc" },
});

console.log(`Target: ${targetDay} (${format(day, "EEEE")})`);
console.log(`API filter: ${apiStart.toISOString()} – ${apiEnd.toISOString()}`);
console.log(`\nAPI-style matches (${apiMatches.length}):`);
for (const a of apiMatches) {
  console.log(`  ${a.startTime.toISOString()} | local ${localKey(a.startTime)} | ${a.discipline} | ${a.name}`);
}

console.log(`\nUTC day matches (${utcMatches.length}):`);
for (const a of utcMatches) {
  console.log(`  ${a.startTime.toISOString()} | local ${localKey(a.startTime)} | ${a.discipline} | ${a.name}`);
}

console.log(`\nJun 24–26 UTC window (${wide.length}):`);
for (const a of wide) {
  console.log(`  ${a.startTime.toISOString()} | local ${localKey(a.startTime)} | ${a.discipline} | ${a.name}`);
}

// All activities whose local key is target day
const all = await db.syncedActivity.findMany({
  where: { athleteId },
  select: { startTime: true, name: true, discipline: true },
  orderBy: { startTime: "asc" },
});
const byLocalKey = all.filter((a) => localKey(a.startTime) === targetDay);
console.log(`\nAll with server-local key ${targetDay}: ${byLocalKey.length}`);
for (const a of byLocalKey) {
  console.log(`  ${a.startTime.toISOString()} | ${a.discipline} | ${a.name}`);
}

await db.$disconnect();
