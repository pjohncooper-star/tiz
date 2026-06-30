import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { upsertImportedActivity } from "@/lib/import/persist";
import {
  cleanupImport,
  parseStagedFile,
  readImportManifest,
  stageFromUploadZip,
} from "@/lib/import/storage";
import { computeActivityZones } from "@/lib/zones/process-activity";
import { advanceOnboardingTo } from "@/lib/onboarding";

const CHUNK_SIZE = 15;
const ZONE_BATCH_SIZE = 25;

type StepRunner = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

const inlineStep: StepRunner = {
  run: async (_id, fn) => fn(),
};

export async function computeZonesInBackground(activityIds: string[]) {
  for (let i = 0; i < activityIds.length; i += ZONE_BATCH_SIZE) {
    const batch = activityIds.slice(i, i + ZONE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (activityId) => {
        try {
          await computeActivityZones(activityId);
        } catch (e) {
          console.error(
            `[import] zone compute failed for ${activityId}:`,
            e instanceof Error ? e.message : e
          );
        }
      })
    );
  }
}

export async function finalizeImportJob(
  jobId: string,
  athleteId: string,
  processed: number,
  failed: number,
  errors: string[]
) {
  await cleanupImport(jobId);

  await db.importJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETE",
      processedFiles: processed,
      failedFiles: failed,
      completedAt: new Date(),
      errorLog: errors.length ? errors.slice(0, 100) : undefined,
    },
  });

  await advanceOnboardingTo(athleteId, "STRAVA");
}

export async function resumeZoneBackfill(athleteId: string) {
  const pending = await db.syncedActivity.findMany({
    where: { athleteId, zoneComputed: false },
    select: { id: true },
    orderBy: { startTime: "desc" },
  });
  if (pending.length === 0) return 0;

  void computeZonesInBackground(pending.map((a) => a.id)).catch((err) => {
    console.error("[import] zone backfill failed:", err);
  });

  return pending.length;
}

export async function processImportBatch(
  jobId: string,
  step: StepRunner = inlineStep
) {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "COMPLETE") return;

  try {
    const manifest = await readImportManifest(jobId);

    await db.importJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", totalFiles: manifest.length },
    });

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];
    const activityIds: string[] = [];

    for (let i = 0; i < manifest.length; i += CHUNK_SIZE) {
      const chunk = manifest.slice(i, i + CHUNK_SIZE);
      const chunkResult = await step.run(`import-chunk-${i}`, async () => {
        let chunkProcessed = 0;
        let chunkFailed = 0;
        const chunkErrors: string[] = [];
        const chunkActivityIds: string[] = [];

        for (const stagedName of chunk) {
          try {
            const parsedList = await parseStagedFile(jobId, stagedName);
            if (parsedList.length === 0) {
              chunkFailed++;
              continue;
            }
            for (const parsed of parsedList) {
              const activity = await upsertImportedActivity(
                job.athleteId,
                jobId,
                parsed,
                "BULK_IMPORT",
                { deferZoneCompute: true }
              );
              chunkActivityIds.push(activity.id);
              chunkProcessed++;
            }
          } catch (e) {
            chunkFailed++;
            chunkErrors.push(
              `${stagedName}: ${e instanceof Error ? e.message : "error"}`
            );
          }
        }

        return {
          processed: chunkProcessed,
          failed: chunkFailed,
          errors: chunkErrors,
          activityIds: chunkActivityIds,
        };
      });

      processed += chunkResult.processed;
      failed += chunkResult.failed;
      errors.push(...chunkResult.errors);
      activityIds.push(...chunkResult.activityIds);

      await db.importJob.update({
        where: { id: jobId },
        data: { processedFiles: processed, failedFiles: failed },
      });
    }

    await finalizeImportJob(jobId, job.athleteId, processed, failed, errors);

    if (activityIds.length > 0) {
      void computeZonesInBackground(activityIds).catch((err) => {
        console.error("[import] background zone compute failed:", err);
      });
    }
  } catch (e) {
    await cleanupImport(jobId).catch(() => {});
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorLog: [e instanceof Error ? e.message : "Import processing failed"],
      },
    });
    throw e;
  }
}

export function shouldProcessImportsLocally() {
  return process.env.NODE_ENV === "development" || process.env.INNGEST_DEV === "1";
}

export function scheduleImportBatch(jobId: string) {
  if (shouldProcessImportsLocally()) {
    void processImportBatch(jobId).catch((err) => {
      console.error("[import] local batch failed:", err);
    });
    return "local" as const;
  }
  return "inngest" as const;
}

const preparingJobs = new Set<string>();

/** Scan a saved upload zip, stage activity files, then start batch processing. */
export function prepareImportFromUpload(jobId: string) {
  if (preparingJobs.has(jobId)) return;
  preparingJobs.add(jobId);

  void (async () => {
    try {
      await db.importJob.update({
        where: { id: jobId },
        data: { status: "PROCESSING", totalFiles: 0 },
      });

      const totalFiles = await stageFromUploadZip(jobId);
      if (totalFiles === 0) {
        throw new Error(
          "No activity files found. Supported: .fit, .tcx, .gpx (including .fit.gz)."
        );
      }

      await db.importJob.update({
        where: { id: jobId },
        data: { totalFiles },
      });

      const mode = scheduleImportBatch(jobId);
      if (mode === "inngest") {
        await inngest.send({
          name: "import/batch.process",
          data: { jobId },
        });
      }
    } catch (e) {
      await cleanupImport(jobId).catch(() => {});
      await db.importJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorLog: [e instanceof Error ? e.message : "Import failed"],
          },
        })
        .catch(() => {});
      console.error("[import] prepare from upload failed:", e);
    } finally {
      preparingJobs.delete(jobId);
    }
  })();
}
