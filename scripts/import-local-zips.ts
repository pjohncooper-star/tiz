import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { unzip } from "fflate";
import ws from "ws";
import { parseFitFile } from "../src/lib/import/fit";
import { upsertImportedActivity } from "../src/lib/import/persist";
import { computeActivityZones } from "../src/lib/zones/process-activity";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
const email = process.argv[2] ?? "pjohncooper@gmail.com";
const zipPaths = process.argv.slice(3);

if (zipPaths.length === 0) {
  console.error(
    "Usage: npx tsx scripts/import-local-zips.ts <email> <zip1> [zip2...]"
  );
  process.exit(1);
}

const user = await db.user.findUnique({
  where: { email },
  include: { athlete: true },
});
if (!user?.athlete) {
  console.error("Athlete not found:", email);
  process.exit(1);
}

const athleteId = user.athlete.id;

const job = await db.importJob.create({
  data: {
    athleteId,
    source: "GARMIN_EXPORT",
    status: "PROCESSING",
    totalFiles: zipPaths.length,
  },
});

const imported: Array<{
  file: string;
  id: string;
  name: string;
  discipline: string;
  legType: string | null;
  duration: number;
  streams: string[];
  zones: boolean;
  multisportGroupId: string | null;
}> = [];

for (const zipPath of zipPaths) {
  const buf = new Uint8Array(fs.readFileSync(zipPath));
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buf, (err, f) => (err ? reject(err) : resolve(f)));
  });
  const fitEntry = Object.entries(files).find(([p]) => /\.fit$/i.test(p));
  if (!fitEntry) {
    console.warn("No FIT in", zipPath);
    continue;
  }
  const [fitName, fitData] = fitEntry;
  const parsedList = parseFitFile(
    new Uint8Array(fitData),
    fitName,
    `${path.basename(zipPath)}/${fitName}`
  );

  for (const parsed of parsedList) {
    const activity = await upsertImportedActivity(
      athleteId,
      job.id,
      parsed,
      "BULK_IMPORT",
      { deferZoneCompute: true }
    );
    await computeActivityZones(activity.id);
    const updated = await db.syncedActivity.findUnique({
      where: { id: activity.id },
      select: {
        id: true,
        name: true,
        discipline: true,
        legType: true,
        durationSeconds: true,
        noUsableSignal: true,
        zoneComputed: true,
        rawStreams: true,
        multisportGroupId: true,
      },
    });
    if (!updated) continue;
    imported.push({
      file: path.basename(zipPath),
      id: updated.id,
      name: updated.name,
      discipline: updated.discipline,
      legType: updated.legType,
      duration: updated.durationSeconds,
      streams: Object.keys((updated.rawStreams as object) ?? {}),
      zones: updated.zoneComputed && !updated.noUsableSignal,
      multisportGroupId: updated.multisportGroupId,
    });
  }
}

await db.importJob.update({
  where: { id: job.id },
  data: {
    status: "COMPLETE",
    processedFiles: zipPaths.length,
    completedAt: new Date(),
  },
});

await db.athlete.update({
  where: { id: athleteId },
  data: { onboardingStep: "COMPLETE" },
});

console.log(JSON.stringify({ imported: imported.length, activities: imported }, null, 2));
await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
