import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const acts = await db.syncedActivity.findMany({
  where: {
    name: { contains: "TrainerRoad", mode: "insensitive" },
    startTime: { gte: new Date("2026-06-01"), lt: new Date("2026-06-10") },
  },
  select: {
    id: true,
    name: true,
    startTime: true,
    durationSeconds: true,
    distanceMeters: true,
    dedupFingerprint: true,
    rawStreams: true,
  },
});

for (const a of acts) {
  const keys = Object.keys(a.rawStreams ?? {});
  console.log(
    a.id,
    a.startTime.toISOString(),
    a.durationSeconds,
    a.distanceMeters,
    keys.join(",")
  );
}

await db.$disconnect();
