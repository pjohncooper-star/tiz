import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { format, startOfDay, endOfDay, parseISO } from "date-fns";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2] ?? "pjohncooper@gmail.com";
const day = process.argv[3] ?? "2026-06-04";

const athlete = await db.athlete.findFirst({ where: { user: { email } } });
const dayStart = startOfDay(parseISO(day));
const dayEnd = endOfDay(parseISO(day));

const activities = await db.syncedActivity.findMany({
  where: {
    athleteId: athlete.id,
    discipline: "BIKE",
    startTime: { gte: dayStart, lte: dayEnd },
  },
  include: {
    zoneBreakdowns: { where: { isCanonical: true }, orderBy: { zone: "asc" } },
  },
  orderBy: { startTime: "asc" },
});

console.log(`BIKE activities on ${day} (${format(dayStart, "EEEE")}):\n`);
for (const a of activities) {
  const streams = a.rawStreams;
  const keys = streams && typeof streams === "object" ? Object.keys(streams) : [];
  console.log({
    id: a.id,
    name: a.name,
    start: a.startTime.toISOString(),
    durationSeconds: a.durationSeconds,
    distanceMeters: a.distanceMeters,
    zoneComputed: a.zoneComputed,
    noUsableSignal: a.noUsableSignal,
    streamKeys: keys,
    zoneCount: a.zoneBreakdowns.length,
    zones: a.zoneBreakdowns.map((z) => `Z${z.zone}:${z.minutes.toFixed(1)}m (${z.signalUsed})`),
  });
}

const pending = await db.syncedActivity.count({
  where: { athleteId: athlete.id, zoneComputed: false },
});

console.log(`\nAthlete activities still awaiting zone compute: ${pending}`);

await db.$disconnect();
