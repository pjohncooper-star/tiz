import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { format } from "date-fns";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2] ?? "pjohncooper@gmail.com";

const user = await db.user.findUnique({
  where: { email },
  include: {
    athlete: {
      include: {
        importJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    },
  },
});

const athleteId = user?.athlete?.id;
const job = user?.athlete?.importJobs[0];

const june2023 = await db.syncedActivity.findMany({
  where: {
    athleteId,
    startTime: {
      gte: new Date("2023-06-01T00:00:00.000Z"),
      lte: new Date("2023-06-30T23:59:59.999Z"),
    },
  },
  orderBy: { startTime: "asc" },
  select: { startTime: true, name: true, discipline: true },
});

console.log("Import job:", job);
console.log(`\nJune 2023 activities (${june2023.length}):`);
for (const a of june2023) {
  console.log(`  ${format(a.startTime, "yyyy-MM-dd EEE HH:mm")} | ${a.discipline} | ${a.name}`);
}

const byDay = new Map();
for (const a of june2023) {
  const k = format(a.startTime, "yyyy-MM-dd");
  byDay.set(k, (byDay.get(k) ?? 0) + 1);
}
console.log("\nPer day counts:");
for (const [k, v] of [...byDay.entries()].sort()) {
  console.log(`  ${k}: ${v}`);
}

await db.$disconnect();
