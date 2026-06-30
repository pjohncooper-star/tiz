import { db } from "@/lib/db";
import { buildDedupFingerprint } from "@/lib/import/dedup";
import type { ParsedActivity } from "@/lib/import/types";
import { upsertFitSelfEvalSurvey } from "@/lib/survey/fit-self-eval";
import type { FitSessionSelfEval } from "@/lib/survey/fit-self-eval";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { inngest } from "@/inngest/client";
import type { ActivitySource, ImportSource } from "@prisma/client";

function mergeSelfEvalIntoRawStreams(
  rawStreams: unknown,
  selfEval?: FitSessionSelfEval
): NormalizedStreams {
  const streams = (rawStreams ?? {}) as NormalizedStreams;
  if (!selfEval) return streams;

  const meta = { ...(streams.meta ?? {}) };
  if (selfEval.workoutFeel != null && selfEval.workoutFeel >= 0) {
    meta.workoutFeel = selfEval.workoutFeel;
  }
  if (selfEval.workoutRpeRaw != null && selfEval.workoutRpeRaw > 0) {
    meta.workoutRpe = selfEval.workoutRpeRaw;
  }

  return { ...streams, meta };
}

function seriesHasData(series: { data?: unknown[] } | undefined): boolean {
  return !!series?.data?.length;
}

/** Prefer newly imported stream series when present; keep existing otherwise. */
export function mergeActivityStreams(
  existing: unknown,
  incoming: NormalizedStreams
): NormalizedStreams {
  const prev = (existing ?? {}) as NormalizedStreams;
  const pick = <T extends { data: unknown[] } | undefined>(
    next: T | undefined,
    prior: T | undefined
  ): T | undefined => (seriesHasData(next) ? next : prior);

  return {
    ...prev,
    ...incoming,
    time: pick(incoming.time, prev.time),
    watts: pick(incoming.watts, prev.watts),
    heartrate: pick(incoming.heartrate, prev.heartrate),
    velocity: pick(incoming.velocity, prev.velocity),
    cadence: pick(incoming.cadence, prev.cadence),
    distance: pick(incoming.distance, prev.distance),
    velocityTime: pick(incoming.velocityTime, prev.velocityTime),
    swimLaps: pick(incoming.swimLaps, prev.swimLaps),
    workoutLaps: pick(incoming.workoutLaps, prev.workoutLaps),
    meta: { ...prev.meta, ...incoming.meta },
  };
}

function incomingHasStreamData(streams: NormalizedStreams): boolean {
  return (
    seriesHasData(streams.time) ||
    seriesHasData(streams.watts) ||
    seriesHasData(streams.heartrate) ||
    seriesHasData(streams.velocity) ||
    seriesHasData(streams.cadence) ||
    seriesHasData(streams.distance) ||
    seriesHasData(streams.workoutLaps) ||
    seriesHasData(streams.swimLaps)
  );
}

export async function upsertImportedActivity(
  athleteId: string,
  importJobId: string | null,
  parsed: ParsedActivity,
  source: ActivitySource = "BULK_IMPORT",
  options?: { deferZoneCompute?: boolean }
) {
  const fingerprint = buildDedupFingerprint(
    parsed.discipline,
    parsed.startTime,
    parsed.durationSeconds,
    parsed.distanceMeters
  );

  const existing = await db.syncedActivity.findUnique({
    where: { athleteId_dedupFingerprint: { athleteId, dedupFingerprint: fingerprint } },
  });
  if (existing) {
    const mergedStreams = incomingHasStreamData(parsed.streams)
      ? mergeActivityStreams(existing.rawStreams, parsed.streams)
      : ((existing.rawStreams ?? {}) as NormalizedStreams);
    const rawStreams = mergeSelfEvalIntoRawStreams(mergedStreams, parsed.selfEval);
    const shouldRecomputeZones = incomingHasStreamData(parsed.streams);
    await db.syncedActivity.update({
      where: { id: existing.id },
      data: {
        rawStreams,
        streamsFetched: true,
        ...(shouldRecomputeZones ? { zoneComputed: false } : {}),
      },
    });
    await upsertFitSelfEvalSurvey(athleteId, existing.id, parsed.selfEval);
    if (shouldRecomputeZones && !options?.deferZoneCompute) {
      await inngest.send({
        name: "activity/zones.compute",
        data: { activityId: existing.id },
      });
    }
    return { ...existing, rawStreams };
  }

  const activity = await db.syncedActivity.create({
    data: {
      athleteId,
      importJobId,
      externalId: parsed.externalId,
      dedupFingerprint: fingerprint,
      discipline: parsed.discipline,
      name: parsed.name,
      startTime: parsed.startTime,
      durationSeconds: parsed.durationSeconds,
      distanceMeters: parsed.distanceMeters,
      source,
      rawStreams: parsed.streams,
      streamsFetched: true,
      isPrOrAchievement: parsed.isPrOrAchievement ?? false,
      multisportGroupId: parsed.multisportGroupId,
      sessionIndex: parsed.sessionIndex,
      legType: parsed.legType,
    },
  });

  await upsertFitSelfEvalSurvey(athleteId, activity.id, parsed.selfEval);

  if (!options?.deferZoneCompute) {
    await inngest.send({
      name: "activity/zones.compute",
      data: { activityId: activity.id },
    });
  }

  return activity;
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
