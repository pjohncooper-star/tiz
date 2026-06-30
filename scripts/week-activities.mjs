import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const anchor = process.argv[2] ?? "2026-06-22";
const athlete = await db.athlete.findFirst({
  where: { user: { email: "pjohncooper@gmail.com" } },
});
const weekStart = startOfWeek(parseISO(anchor), { weekStartsOn: 1 });
const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

const acts = await db.syncedActivity.findMany({
  where: {
    athleteId: athlete.id,
    startTime: { gte: weekStart, lte: weekEnd },
  },
  orderBy: { startTime: "asc" },
});

console.log(`Week of ${format(weekStart, "yyyy-MM-dd")}: ${acts.length} activities\n`);
for (const a of acts) {
  const day = format(a.startTime, "EEE yyyy-MM-dd HH:mm");
  console.log(`${day} | ${a.discipline} | ${a.durationSeconds}s | ${a.name}`);
}

const monday = acts.filter((a) => format(a.startTime, "yyyy-MM-dd") === format(weekStart, "yyyy-MM-dd"));
console.log(`\nMonday ${format(weekStart, "yyyy-MM-dd")}: ${monday.length}`);
for (const a of monday) {
  console.log(`  ${format(a.startTime, "HH:mm")} | ${a.name} | ${a.durationSeconds}s`);
}

await db.$disconnect();
