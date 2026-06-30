import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2] ?? "pjohncooper@gmail.com";

const athlete = await db.athlete.findFirst({
  where: { user: { email } },
  select: { id: true },
});
if (!athlete) {
  console.error("Athlete not found");
  process.exit(1);
}

const stubs = await db.syncedActivity.findMany({
  where: {
    athleteId: athlete.id,
    name: { contains: "TrainerRoad", mode: "insensitive" },
    noUsableSignal: true,
    rawStreams: { path: ["velocity"], not: null },
  },
  select: { id: true, name: true, startTime: true, durationSeconds: true },
  orderBy: { startTime: "asc" },
});

console.log("TrainerRoad workout stubs (velocity only, no zones):", stubs.length);
for (const s of stubs) {
  console.log(s.id, s.startTime.toISOString().slice(0, 10), s.durationSeconds + "s");
}

if (process.argv.includes("--delete")) {
  const ids = stubs.map((s) => s.id);
  await db.zoneBreakdown.deleteMany({ where: { activityId: { in: ids } } });
  const result = await db.syncedActivity.deleteMany({ where: { id: { in: ids } } });
  console.log("Deleted", result.count, "activities");
}

await db.$disconnect();
