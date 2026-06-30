import type { Discipline } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import type { DisplayUnit } from "@/lib/workout/metrics";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import {
  buildCompletedSnapshotFromSession,
  hasSessionCompletionOverride,
  type SessionCompletionFields,
} from "@/lib/plan/session-completion";
import {
  buildCompletedSessionStats,
  type CompletedSessionSnapshot,
} from "@/lib/plan/session-stats";

const activitySelect = {
  id: true,
  name: true,
  durationSeconds: true,
  distanceMeters: true,
  rawStreams: true,
  zoneBreakdowns: {
    where: { isCanonical: true },
    select: { zone: true, minutes: true, isCanonical: true },
  },
} as const;

const sessionCompletionSelect = {
  completedDurationMinutes: true,
  completedDistanceMeters: true,
  completedTargetSpeedMps: true,
  completedTargetPaceSeconds: true,
  completedZones: true,
  linkedActivityId: true,
} as const;

async function loadSessionCompletion(
  athleteId: string,
  plannedSessionId: string
): Promise<SessionCompletionFields & { linkedActivityId: string | null } | null> {
  return db.plannedSession.findFirst({
    where: { id: plannedSessionId, athleteId },
    select: sessionCompletionSelect,
  });
}

export async function getCompletedSessionSnapshot(
  athleteId: string,
  scheduledDate: Date,
  discipline: Discipline,
  displayUnit: DisplayUnit,
  options?: {
    plannedSessionId?: string;
    linkedActivityId?: string | null;
    sessionCompletion?: SessionCompletionFields;
  }
): Promise<CompletedSessionSnapshot> {
  const sessionFields =
    options?.sessionCompletion ??
    (options?.plannedSessionId
      ? await loadSessionCompletion(athleteId, options.plannedSessionId)
      : null);

  if (sessionFields && hasSessionCompletionOverride(sessionFields)) {
    return buildCompletedSnapshotFromSession(sessionFields, discipline, displayUnit);
  }

  const linkedActivityId =
    sessionFields?.linkedActivityId ?? options?.linkedActivityId ?? null;

  if (linkedActivityId) {
    const linked = await db.syncedActivity.findFirst({
      where: {
        id: linkedActivityId,
        athleteId,
        ...recordedActivityWhere,
      },
      select: activitySelect,
    });
    return buildCompletedSessionStats(linked ? [linked] : [], discipline, displayUnit);
  }

  if (options?.plannedSessionId) {
    const linkedSessions = await db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate,
        discipline,
        linkedActivityId: { not: null },
        NOT: { id: options.plannedSessionId },
      },
      select: { linkedActivityId: true },
    });
    const takenIds = linkedSessions
      .map((s) => s.linkedActivityId)
      .filter((id): id is string => !!id);

    const unlinked = await db.syncedActivity.findMany({
      where: {
        athleteId,
        discipline,
        startTime: {
          gte: startOfDay(scheduledDate),
          lte: endOfDay(scheduledDate),
        },
        ...recordedActivityWhere,
        ...(takenIds.length > 0 ? { id: { notIn: takenIds } } : {}),
      },
      select: activitySelect,
      orderBy: { startTime: "asc" },
    });

    const unlinkedSessionCount = await db.plannedSession.count({
      where: {
        athleteId,
        scheduledDate,
        discipline,
        linkedActivityId: null,
      },
    });

    if (unlinked.length === 1 && unlinkedSessionCount === 1) {
      return buildCompletedSessionStats(unlinked, discipline, displayUnit);
    }

    return buildCompletedSessionStats([], discipline, displayUnit);
  }

  const activities = await db.syncedActivity.findMany({
    where: {
      athleteId,
      discipline,
      startTime: {
        gte: startOfDay(scheduledDate),
        lte: endOfDay(scheduledDate),
      },
      ...recordedActivityWhere,
    },
    select: activitySelect,
    orderBy: { startTime: "asc" },
  });

  return buildCompletedSessionStats(activities, discipline, displayUnit);
}
