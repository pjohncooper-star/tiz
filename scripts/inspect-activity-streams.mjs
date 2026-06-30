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
  include: { importJob: true },
});
if (!a) {
  console.log("Activity not found");
  process.exit(1);
}

const rs = a.rawStreams ?? {};
const keys = Object.keys(rs);
const stats = {};
for (const k of keys) {
  const data = rs[k]?.data ?? [];
  const nums = data.filter((v) => typeof v === "number");
  stats[k] = {
    len: data.length,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    nonzero: nums.filter((v) => v > 0).length,
    sample: data.slice(0, 8),
  };
}

console.log(
  JSON.stringify(
    {
      id: a.id,
      name: a.name,
      start: a.startTime,
      durationSeconds: a.durationSeconds,
      distanceMeters: a.distanceMeters,
      source: a.source,
      externalId: a.externalId,
      dedupFingerprint: a.dedupFingerprint,
      zoneComputed: a.zoneComputed,
      noUsableSignal: a.noUsableSignal,
      importJobId: a.importJobId,
      streamStats: stats,
    },
    null,
    2
  )
);

await db.$disconnect();
