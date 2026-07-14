import type { ActivityLegType, ActivitySource, Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import {
  findMatchingActivity,
  fingerprintsForCandidate,
  type ActivityMatchFields,
} from "@/lib/activity/match";
import { buildNormalizedDedupFingerprint } from "@/lib/import/dedup";
import type { ParsedActivity } from "@/lib/import/types";
import {
  incomingHasStreamData,
  mergeActivityStreams,
  mergeSelfEvalIntoRawStreams,
} from "@/lib/import/persist-helpers";
import { upsertFitSelfEvalSurvey } from "@/lib/survey/fit-self-eval";
import type { FitSessionSelfEval } from "@/lib/survey/fit-self-eval";
import { tryAutoLinkActivityToPlannedSession } from "@/lib/plan/session-link";
import { inngest } from "@/inngest/client";
import type { NormalizedStreams } from "@/lib/zones/compute";

export type SyncedActivityWrite = {
  name: string;
  discipline: Discipline;
  startTime: Date;
  utcOffsetSeconds?: number | null;
  durationSeconds: number;
  distanceMeters?: number | null;
  externalId?: string | null;
  rawStreams: NormalizedStreams;
  source: ActivitySource;
  importJobId?: string | null;
  selfEval?: FitSessionSelfEval;
  isPrOrAchievement?: boolean;
  multisportGroupId?: string | null;
  sessionIndex?: number | null;
  legType?: ActivityLegType | null;
};

export type UpsertSyncedOptions = {
  deferZoneCompute?: boolean;
  linkPlannedSession?: boolean;
  /** Duration for fingerprint / fuzzy match (e.g. moving time). Defaults to durationSeconds. */
  matchDurationSeconds?: number;
};

/** Prefer FIT moving time in meta when present (aligns with Strava moving_time). */
export function matchDurationFromParsed(parsed: ParsedActivity): number {
  const moving = parsed.streams?.meta?.movingSeconds;
  if (typeof moving === "number" && moving > 0) return Math.round(moving);
  return parsed.durationSeconds;
}

function matchFields(
  input: SyncedActivityWrite,
  matchDurationSeconds: number
): ActivityMatchFields {
  return {
    discipline: input.discipline,
    startTime: input.startTime,
    durationSeconds: matchDurationSeconds,
    distanceMeters: input.distanceMeters,
    externalId: input.externalId,
  };
}

export async function upsertSyncedActivity(
  athleteId: string,
  input: SyncedActivityWrite,
  options?: UpsertSyncedOptions
) {
  const matchDuration = options?.matchDurationSeconds ?? input.durationSeconds;
  const candidate = matchFields(input, matchDuration);
  const normalizedFingerprint = buildNormalizedDedupFingerprint(
    candidate.discipline,
    candidate.startTime,
    candidate.durationSeconds,
    candidate.distanceMeters
  );

  const existing = await findMatchingActivity(db, athleteId, candidate);
  const incomingHasStreams = incomingHasStreamData(input.rawStreams);

  if (existing) {
    const mergedStreams = incomingHasStreams
      ? mergeActivityStreams(existing.rawStreams, input.rawStreams)
      : ((existing.rawStreams ?? {}) as NormalizedStreams);
    const rawStreams = mergeSelfEvalIntoRawStreams(mergedStreams, input.selfEval);
    const shouldRecomputeZones = incomingHasStreams;

    const updated = await db.syncedActivity.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        rawStreams,
        streamsFetched: true,
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.utcOffsetSeconds != null
          ? { utcOffsetSeconds: input.utcOffsetSeconds }
          : {}),
        dedupFingerprint: normalizedFingerprint,
        ...(shouldRecomputeZones ? { zoneComputed: false } : {}),
      },
    });

    await upsertFitSelfEvalSurvey(athleteId, existing.id, input.selfEval);
    if (shouldRecomputeZones && !options?.deferZoneCompute) {
      await inngest.send({
        name: "activity/zones.compute",
        data: { activityId: existing.id },
      });
    }
    if (options?.linkPlannedSession) {
      await tryAutoLinkActivityToPlannedSession(athleteId, existing.id);
    }
    return updated;
  }

  const activity = await db.syncedActivity.create({
    data: {
      athleteId,
      importJobId: input.importJobId ?? null,
      externalId: input.externalId ?? null,
      dedupFingerprint: normalizedFingerprint,
      discipline: input.discipline,
      name: input.name,
      startTime: input.startTime,
      utcOffsetSeconds: input.utcOffsetSeconds ?? null,
      durationSeconds: input.durationSeconds,
      distanceMeters: input.distanceMeters ?? null,
      source: input.source,
      rawStreams: input.rawStreams,
      streamsFetched: true,
      isPrOrAchievement: input.isPrOrAchievement ?? false,
      multisportGroupId: input.multisportGroupId ?? null,
      sessionIndex: input.sessionIndex ?? null,
      legType: input.legType ?? null,
    },
  });

  await upsertFitSelfEvalSurvey(athleteId, activity.id, input.selfEval);

  if (!options?.deferZoneCompute) {
    await inngest.send({
      name: "activity/zones.compute",
      data: { activityId: activity.id },
    });
  }
  if (options?.linkPlannedSession) {
    await tryAutoLinkActivityToPlannedSession(athleteId, activity.id);
  }
  return activity;
}

export { fingerprintsForCandidate };
