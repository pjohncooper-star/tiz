import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const groupId = process.argv[2] ?? "e33dfe230fa2eb7531ac91fd";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const acts = await db.syncedActivity.findMany({
    where: { multisportGroupId: groupId },
    orderBy: { sessionIndex: "asc" },
    include: {
      zoneBreakdowns: {
        where: { isCanonical: true },
        orderBy: { zone: "asc" },
      },
    },
  });

  for (const a of acts) {
    const rs = a.rawStreams as Record<string, { data: number[] }> | null;
    const watts = rs?.watts?.data ?? [];
    const activeW = watts.filter((w) => w > 0);
    const zones = a.zoneBreakdowns
      .map(
        (z) =>
          `Z${z.zone}:${z.minutes.toFixed(1)}min (${z.signalUsed}${z.usedFallback ? " fb" : ""})`
      )
      .join(", ");

    console.log({
      id: a.id,
      name: a.name,
      leg: a.legType,
      start: a.startTime.toISOString(),
      durationMin: (a.durationSeconds / 60).toFixed(1),
      distanceKm: a.distanceMeters
        ? (a.distanceMeters / 1000).toFixed(2)
        : null,
      streams: rs ? Object.keys(rs) : [],
      powerSamples: activeW.length,
      powerAvgW: activeW.length
        ? Math.round(activeW.reduce((s, x) => s + x, 0) / activeW.length)
        : null,
      noUsableSignal: a.noUsableSignal,
      zones: zones || "none",
    });
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
