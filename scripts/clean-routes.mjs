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
});

if (!athlete) {
  console.error("No athlete");
  process.exit(1);
}

const result = await db.syncedActivity.deleteMany({
  where: {
    athleteId: athlete.id,
    durationSeconds: { lte: 30 },
    noUsableSignal: true,
    OR: [{ distanceMeters: null }, { distanceMeters: 0 }],
  },
});

console.log(`Removed ${result.count} course/route stubs for ${email}`);
await db.$disconnect();
