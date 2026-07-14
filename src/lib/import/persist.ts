import type { ParsedActivity } from "@/lib/import/types";
import {
  matchDurationFromParsed,
  upsertSyncedActivity,
} from "@/lib/activity/upsert-synced";
import type { ActivitySource, ImportSource } from "@prisma/client";
import { db } from "@/lib/db";

export {
  mergeActivityStreams,
  incomingHasStreamData,
  mergeSelfEvalIntoRawStreams,
} from "@/lib/import/persist-helpers";

export async function upsertImportedActivity(
  athleteId: string,
  importJobId: string | null,
  parsed: ParsedActivity,
  source: ActivitySource = "BULK_IMPORT",
  options?: { deferZoneCompute?: boolean }
) {
  return upsertSyncedActivity(
    athleteId,
    {
      name: parsed.name,
      discipline: parsed.discipline,
      startTime: parsed.startTime,
      utcOffsetSeconds: parsed.utcOffsetSeconds ?? null,
      durationSeconds: parsed.durationSeconds,
      distanceMeters: parsed.distanceMeters,
      externalId: parsed.externalId,
      rawStreams: parsed.streams,
      source,
      importJobId,
      selfEval: parsed.selfEval,
      isPrOrAchievement: parsed.isPrOrAchievement ?? false,
      multisportGroupId: parsed.multisportGroupId,
      sessionIndex: parsed.sessionIndex,
      legType: parsed.legType,
    },
    {
      deferZoneCompute: options?.deferZoneCompute,
      matchDurationSeconds: matchDurationFromParsed(parsed),
    }
  );
}

export async function processImportJob(jobId: string, source: ImportSource) {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Import job not found");

  await db.importJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING" },
  });

  return { jobId, source, athleteId: job.athleteId };
}
