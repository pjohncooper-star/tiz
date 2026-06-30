import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const a = await db.syncedActivity.findFirst({
  where: { name: "Irish Hills", athlete: { user: { email: "pjohncooper@gmail.com" } } },
  select: {
    durationSeconds: true,
    distanceMeters: true,
    rawStreams: true,
    zoneComputed: true,
    noUsableSignal: true,
    startTime: true,
  },
});
console.log(JSON.stringify(a, null, 2));
await db.$disconnect();
