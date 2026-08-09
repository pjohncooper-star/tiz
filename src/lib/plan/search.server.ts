import type { Discipline, Prisma } from "@prisma/client";
import {
  activityLocalDateKey,
  endDateKey,
  formatDateKey,
  parseDateKey,
} from "@/lib/dates";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import { calendarWeekReturnHref } from "@/lib/plan/workout-return";
import { workoutHref } from "@/lib/plan/workout-href";
import { resolveWorkoutTagLabels } from "@/lib/plan/workout-tags.server";
import {
  compareSearchHitsNewestFirst,
  decodeSearchCursor,
  encodeSearchCursor,
  isAfterSearchCursor,
  parseOptionalPositiveNumber,
  parseSearchTagFilter,
  type TrainingSearchHit,
} from "@/lib/plan/search";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DISCIPLINES = new Set<Discipline>(["BIKE", "RUN", "SWIM", "STRENGTH"]);

export type TrainingSearchParams = {
  q?: string | null;
  discipline?: string | null;
  minDistanceMeters?: string | null;
  maxDistanceMeters?: string | null;
  minDurationMinutes?: string | null;
  maxDurationMinutes?: string | null;
  from?: string | null;
  to?: string | null;
  tags?: string | null;
  limit?: string | null;
  cursor?: string | null;
};

function durationRangeFilter(
  min: number | undefined,
  max: number | undefined
): Prisma.IntNullableFilter | Prisma.FloatNullableFilter | undefined {
  if (min == null && max == null) return undefined;
  return {
    ...(min != null ? { gte: min } : {}),
    ...(max != null ? { lte: max } : {}),
  };
}

function distanceRangeFilter(
  min: number | undefined,
  max: number | undefined
): Prisma.FloatNullableFilter | undefined {
  if (min == null && max == null) return undefined;
  return {
    ...(min != null ? { gte: min } : {}),
    ...(max != null ? { lte: max } : {}),
  };
}

function sessionEffectiveDurationMinutes(session: {
  estimatedDurationMinutes: number | null;
  completedDurationMinutes: number | null;
}): number | null {
  if (session.completedDurationMinutes != null && session.completedDurationMinutes > 0) {
    return session.completedDurationMinutes;
  }
  if (session.estimatedDurationMinutes != null && session.estimatedDurationMinutes > 0) {
    return session.estimatedDurationMinutes;
  }
  return null;
}

function sessionEffectiveDistanceMeters(session: {
  distanceMeters: number | null;
  completedDistanceMeters: number | null;
}): number | null {
  if (session.completedDistanceMeters != null && session.completedDistanceMeters > 0) {
    return session.completedDistanceMeters;
  }
  if (session.distanceMeters != null && session.distanceMeters > 0) {
    return session.distanceMeters;
  }
  return null;
}

function matchesNumericRange(
  value: number | null,
  min: number | undefined,
  max: number | undefined
): boolean {
  if (min == null && max == null) return true;
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

export async function searchTrainingHistory(
  athleteId: string,
  params: TrainingSearchParams
): Promise<{ results: TrainingSearchHit[]; nextCursor: string | null }> {
  const q = params.q?.trim() || "";
  const discipline =
    params.discipline && DISCIPLINES.has(params.discipline as Discipline)
      ? (params.discipline as Discipline)
      : undefined;
  const minDistance = parseOptionalPositiveNumber(params.minDistanceMeters ?? null);
  const maxDistance = parseOptionalPositiveNumber(params.maxDistanceMeters ?? null);
  const minDuration = parseOptionalPositiveNumber(params.minDurationMinutes ?? null);
  const maxDuration = parseOptionalPositiveNumber(params.maxDurationMinutes ?? null);
  const from = params.from && DATE_KEY.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_KEY.test(params.to) ? params.to : undefined;
  const tagFilter = parseSearchTagFilter(params.tags ?? null);
  const limitRaw = parseOptionalPositiveNumber(params.limit ?? null);
  const limit = Math.min(Math.max(Math.floor(limitRaw ?? 40), 1), 100);
  const cursor = decodeSearchCursor(params.cursor);

  const durationFilter = durationRangeFilter(minDuration, maxDuration);
  const distanceFilter = distanceRangeFilter(minDistance, maxDistance);

  const sessionAnd: Prisma.PlannedSessionWhereInput[] = [];
  if (durationFilter) {
    sessionAnd.push({
      OR: [
        { estimatedDurationMinutes: durationFilter as Prisma.IntNullableFilter },
        { completedDurationMinutes: durationFilter as Prisma.FloatNullableFilter },
      ],
    });
  }
  if (distanceFilter) {
    sessionAnd.push({
      OR: [{ distanceMeters: distanceFilter }, { completedDistanceMeters: distanceFilter }],
    });
  }

  const sessionWhere: Prisma.PlannedSessionWhereInput = {
    athleteId,
    ...(discipline ? { discipline } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(from || to
      ? {
          scheduledDate: {
            ...(from ? { gte: parseDateKey(from) } : {}),
            ...(to ? { lte: parseDateKey(to) } : {}),
          },
        }
      : {}),
    ...(tagFilter.length > 0 ? { tags: { hasEvery: tagFilter } } : {}),
    ...(sessionAnd.length > 0 ? { AND: sessionAnd } : {}),
  };

  const fetchLimit = Math.min(limit * 3, 200);

  const sessionsPromise = db.plannedSession.findMany({
    where: sessionWhere,
    select: {
      id: true,
      title: true,
      discipline: true,
      scheduledDate: true,
      tags: true,
      estimatedDurationMinutes: true,
      completedDurationMinutes: true,
      distanceMeters: true,
      completedDistanceMeters: true,
    },
    orderBy: [{ scheduledDate: "desc" }, { id: "desc" }],
    take: fetchLimit,
  });

  // Tag filters only apply to planned sessions.
  const activitiesPromise =
    tagFilter.length > 0
      ? Promise.resolve([])
      : db.syncedActivity.findMany({
          where: {
            athleteId,
            linkedPlannedSession: null,
            ...recordedActivityWhere,
            ...(discipline ? { discipline } : {}),
            ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
            ...(from || to
              ? {
                  startTime: {
                    ...(from
                      ? {
                          gte: new Date(
                            parseDateKey(from).getTime() - 14 * 60 * 60 * 1000
                          ),
                        }
                      : {}),
                    ...(to
                      ? {
                          lte: new Date(
                            endDateKey(to).getTime() + 14 * 60 * 60 * 1000
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
            ...(durationFilter
              ? {
                  durationSeconds: {
                    ...(minDuration != null ? { gte: Math.floor(minDuration * 60) } : {}),
                    ...(maxDuration != null ? { lte: Math.ceil(maxDuration * 60) } : {}),
                  },
                }
              : {}),
            ...(distanceFilter ? { distanceMeters: distanceFilter } : {}),
          },
          select: {
            id: true,
            name: true,
            discipline: true,
            startTime: true,
            utcOffsetSeconds: true,
            durationSeconds: true,
            distanceMeters: true,
          },
          orderBy: [{ startTime: "desc" }, { id: "desc" }],
          take: fetchLimit,
        });

  const [sessions, activities] = await Promise.all([sessionsPromise, activitiesPromise]);

  const allTagNames = Array.from(new Set(sessions.flatMap((s) => s.tags)));
  const labelByName = new Map<string, string>();
  if (allTagNames.length > 0) {
    const labels = await resolveWorkoutTagLabels(db, athleteId, allTagNames);
    allTagNames.forEach((name, i) => {
      labelByName.set(name, labels[i] ?? name);
    });
  }

  const hits: TrainingSearchHit[] = [];

  for (const session of sessions) {
    const dateKey = formatDateKey(session.scheduledDate);
    const durationMinutes = sessionEffectiveDurationMinutes(session);
    const distanceMeters = sessionEffectiveDistanceMeters(session);
    if (!matchesNumericRange(durationMinutes, minDuration, maxDuration)) continue;
    if (!matchesNumericRange(distanceMeters, minDistance, maxDistance)) continue;

    const weekHref = calendarWeekReturnHref(dateKey);
    hits.push({
      kind: "session",
      id: session.id,
      title: session.title,
      discipline: session.discipline,
      dateKey,
      durationMinutes,
      distanceMeters,
      tags: session.tags.map((name) => labelByName.get(name) ?? name),
      weekHref,
      detailHref: workoutHref(session.id, { returnTo: weekHref }),
    });
  }

  for (const activity of activities) {
    const dateKey = activityLocalDateKey(activity.startTime, activity.utcOffsetSeconds);
    if (from && dateKey < from) continue;
    if (to && dateKey > to) continue;
    const durationMinutes =
      activity.durationSeconds > 0 ? activity.durationSeconds / 60 : null;
    const distanceMeters =
      activity.distanceMeters != null && activity.distanceMeters > 0
        ? activity.distanceMeters
        : null;
    if (!matchesNumericRange(durationMinutes, minDuration, maxDuration)) continue;
    if (!matchesNumericRange(distanceMeters, minDistance, maxDistance)) continue;

    const weekHref = calendarWeekReturnHref(dateKey);
    const returnTo = encodeURIComponent(weekHref);
    hits.push({
      kind: "activity",
      id: activity.id,
      title: activity.name,
      discipline: activity.discipline,
      dateKey,
      durationMinutes,
      distanceMeters,
      tags: [],
      weekHref,
      detailHref: `/activities/${activity.id}?returnTo=${returnTo}`,
    });
  }

  hits.sort(compareSearchHitsNewestFirst);

  const afterCursor = cursor
    ? hits.filter((hit) => isAfterSearchCursor(hit, cursor))
    : hits;
  const page = afterCursor.slice(0, limit);
  const next =
    afterCursor.length > limit
      ? encodeSearchCursor({
          dateKey: page[page.length - 1]!.dateKey,
          kind: page[page.length - 1]!.kind,
          id: page[page.length - 1]!.id,
        })
      : null;

  return { results: page, nextCursor: next };
}
