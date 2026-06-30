import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const id = process.argv[2] ?? "cmqpaghco00u36w98sm8mve97";
const a = await db.syncedActivity.findUnique({
  where: { id },
  select: { rawStreams: true, durationSeconds: true, distanceMeters: true },
});
const vel = a?.rawStreams?.velocity?.data ?? [];
const n = vel.length;
const head = vel.slice(0, 10);
const tail = vel.slice(-10);
let monotonic = true;
for (let i = 1; i < vel.length; i++) {
  if (vel[i] < vel[i - 1]) {
    monotonic = false;
    break;
  }
}
const diffs = [];
for (let i = 1; i < Math.min(vel.length, 50); i++) {
  diffs.push(Number((vel[i] - vel[i - 1]).toFixed(3)));
}
console.log({
  len: n,
  duration: a?.durationSeconds,
  distance: a?.distanceMeters,
  head,
  tail,
  max: Math.max(...vel),
  monotonic,
  diffs,
  avgDiff:
    diffs.length > 0 ? diffs.reduce((s, v) => s + v, 0) / diffs.length : null,
});

await db.$disconnect();
