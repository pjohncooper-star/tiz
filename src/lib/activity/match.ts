import type { Discipline, SyncedActivity } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  buildDedupFingerprint,
  buildNormalizedDedupFingerprint,
} from "@/lib/import/dedup";

export const FUZZY_START_MS = 2 * 60 * 1000;
export const FUZZY_DURATION_ABS_SEC = 90;
export const FUZZY_DURATION_PCT = 0.03;
export const FUZZY_DISTANCE_PCT = 0.02;

export type ActivityMatchFields = {
  discipline: Discipline;
  startTime: Date;
  durationSeconds: number;
  distanceMeters?: number | null;
  externalId?: string | null;
};

function distanceClose(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  const da = a ?? 0;
  const db = b ?? 0;
  if (da === 0 && db === 0) return true;
  const max = Math.max(da, db, 1);
  return Math.abs(da - db) / max <= FUZZY_DISTANCE_PCT;
}

function durationClose(a: number, b: number): boolean {
  const delta = Math.abs(a - b);
  const pct = Math.max(a, b, 1) * FUZZY_DURATION_PCT;
  return delta <= Math.max(FUZZY_DURATION_ABS_SEC, pct);
}

/** Pure fuzzy duplicate check (used by sync + dedup script). */
export function activitiesFuzzyMatch(
  a: ActivityMatchFields,
  b: ActivityMatchFields
): boolean {
  if (a.discipline !== b.discipline) return false;
  if (Math.abs(a.startTime.getTime() - b.startTime.getTime()) > FUZZY_START_MS) {
    return false;
  }
  if (!durationClose(a.durationSeconds, b.durationSeconds)) return false;
  return distanceClose(a.distanceMeters, b.distanceMeters);
}

export function fingerprintsForCandidate(fields: ActivityMatchFields): {
  legacy: string;
  normalized: string;
} {
  const { discipline, startTime, durationSeconds, distanceMeters } = fields;
  return {
    legacy: buildDedupFingerprint(discipline, startTime, durationSeconds, distanceMeters),
    normalized: buildNormalizedDedupFingerprint(
      discipline,
      startTime,
      durationSeconds,
      distanceMeters
    ),
  };
}

type DbLike = Pick<PrismaClient, "syncedActivity">;

export async function findMatchingActivity(
  db: DbLike,
  athleteId: string,
  candidate: ActivityMatchFields
): Promise<SyncedActivity | null> {
  if (candidate.externalId) {
    const byExternal = await db.syncedActivity.findFirst({
      where: { athleteId, externalId: candidate.externalId },
    });
    if (byExternal) return byExternal;
  }

  const windowStart = new Date(candidate.startTime.getTime() - FUZZY_START_MS);
  const windowEnd = new Date(candidate.startTime.getTime() + FUZZY_START_MS);
  const nearby = await db.syncedActivity.findMany({
    where: {
      athleteId,
      discipline: candidate.discipline,
      startTime: { gte: windowStart, lte: windowEnd },
    },
  });

  let best: SyncedActivity | null = null;
  let bestDelta = Infinity;
  for (const row of nearby) {
    if (
      !activitiesFuzzyMatch(candidate, {
        discipline: row.discipline,
        startTime: row.startTime,
        durationSeconds: row.durationSeconds,
        distanceMeters: row.distanceMeters,
      })
    ) {
      continue;
    }
    const delta = Math.abs(row.startTime.getTime() - candidate.startTime.getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      best = row;
    }
  }
  if (best) return best;

  const { legacy, normalized } = fingerprintsForCandidate(candidate);
  for (const fp of [normalized, legacy]) {
    const byFp = await db.syncedActivity.findUnique({
      where: { athleteId_dedupFingerprint: { athleteId, dedupFingerprint: fp } },
    });
    if (byFp) return byFp;
  }

  return null;
}
