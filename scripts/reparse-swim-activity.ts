import "dotenv/config";
import fs from "fs";
import { unzip } from "fflate";
import { parseFitFile } from "../src/lib/import/fit";
import { computeActivityZones } from "../src/lib/zones/process-activity";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const activityId = process.argv[2] ?? "cmqph4ves00178w98iug0hv77";
  const zipPath =
    process.argv[3] ??
    "c:\\Users\\pjohn\\OneDrive\\Desktop\\workout types\\23176615938 pool swim LCM.zip";

  const buf = new Uint8Array(fs.readFileSync(zipPath));
  const files = await new Promise<Record<string, Uint8Array>>((res, rej) =>
    unzip(buf, (e, f) => (e ? rej(e) : res(f)))
  );
  const fitName = Object.keys(files).find((p) => /\.fit$/i.test(p))!;
  const parsed = parseFitFile(
    new Uint8Array(files[fitName]),
    fitName,
    zipPath
  )[0];

  const keys = Object.keys(parsed.streams);
  console.log("streams:", keys);
  console.log(
    "velocity samples:",
    parsed.streams.velocity?.data.length,
    "active:",
    parsed.streams.velocity?.data.filter((v) => v > 0).length
  );
  console.log("velocityTime end:", parsed.streams.velocityTime?.data.at(-1));
  console.log(
    "swim laps:",
    parsed.streams.swimLaps?.data.length,
    "rest:",
    parsed.streams.swimLaps?.data.filter((l) => l.speedMps <= 0).length
  );

  await db.syncedActivity.update({
    where: { id: activityId },
    data: {
      rawStreams: parsed.streams,
      zoneComputed: false,
      noUsableSignal: false,
    },
  });
  await db.zoneBreakdown.deleteMany({ where: { activityId } });
  await computeActivityZones(activityId);

  const updated = await db.syncedActivity.findUnique({
    where: { id: activityId },
    include: { zoneBreakdowns: { where: { isCanonical: true } } },
  });

  const totalMin = updated?.zoneBreakdowns.reduce((s, z) => s + z.minutes, 0) ?? 0;
  console.log(
    JSON.stringify(
      {
        noUsableSignal: updated?.noUsableSignal,
        zones: updated?.zoneBreakdowns.map((z) => ({
          zone: z.zone,
          min: z.minutes.toFixed(1),
          signal: z.signalUsed,
        })),
        totalZoneMin: totalMin.toFixed(1),
        durationMin: ((updated?.durationSeconds ?? 0) / 60).toFixed(1),
      },
      null,
      2
    )
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
