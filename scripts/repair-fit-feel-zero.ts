import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { buildDedupFingerprint } from "@/lib/import/dedup";
import { parseFileFromZip } from "@/lib/import/zip";
import { upsertFitSelfEvalSurvey } from "@/lib/survey/fit-self-eval";
import type { NormalizedStreams } from "@/lib/zones/compute";

const IMPORT_ROOT = path.join(process.cwd(), ".data", "imports");

async function repairFromStagedFiles() {
  let repaired = 0;
  let scanned = 0;

  let jobDirs: string[] = [];
  try {
    jobDirs = await fs.readdir(IMPORT_ROOT);
  } catch {
    console.log("No staged import directory found");
    return { repaired, scanned };
  }

  for (const jobId of jobDirs) {
    const manifestPath = path.join(IMPORT_ROOT, jobId, "manifest.json");
    let manifest: string[];
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as string[];
    } catch {
      continue;
    }

    for (const stagedName of manifest) {
      if (!stagedName.toLowerCase().includes(".fit")) continue;
      const data = new Uint8Array(
        await fs.readFile(path.join(IMPORT_ROOT, jobId, stagedName))
      );
      const originalName = stagedName.replace(/^\d+_/, "");
      const parsedActivities = parseFileFromZip({ path: originalName, data });
      scanned += parsedActivities.length;

      for (const parsed of parsedActivities) {
        const feel = parsed.selfEval?.workoutFeel;
        if (feel == null) continue;

        const fingerprint = buildDedupFingerprint(
          parsed.discipline,
          parsed.startTime,
          parsed.durationSeconds,
          parsed.distanceMeters
        );

        const activity = await db.syncedActivity.findFirst({
          where: { dedupFingerprint: fingerprint },
          select: { id: true, athleteId: true, rawStreams: true },
        });
        if (!activity) continue;

        const streams = (activity.rawStreams ?? {}) as NormalizedStreams;
        const meta = {
          ...(streams.meta ?? {}),
          workoutFeel: feel,
          ...(parsed.selfEval?.workoutRpeRaw
            ? { workoutRpe: parsed.selfEval.workoutRpeRaw }
            : {}),
        };

        await db.syncedActivity.update({
          where: { id: activity.id },
          data: { rawStreams: { ...streams, meta } },
        });
        await upsertFitSelfEvalSurvey(activity.athleteId, activity.id, parsed.selfEval);
        repaired++;
      }
    }
  }

  return { repaired, scanned };
}

async function main() {
  const result = await repairFromStagedFiles();
  console.log(
    `Scanned ${result.scanned} parsed activities from staged FIT files; repaired ${result.repaired}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
