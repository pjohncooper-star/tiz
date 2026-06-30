import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const athlete = await db.athlete.findFirst({
  where: { user: { email: "pjohncooper@gmail.com" } },
});

const routeLike = await db.syncedActivity.count({
  where: {
    athleteId: athlete.id,
    durationSeconds: { lte: 30 },
    OR: [{ distanceMeters: null }, { distanceMeters: 0 }],
    noUsableSignal: true,
  },
});

const total = await db.syncedActivity.count({ where: { athleteId: athlete.id } });

console.log({ total, routeLike });

await db.$disconnect();
