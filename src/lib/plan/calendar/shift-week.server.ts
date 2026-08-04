import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysToDateKey, formatDateKey, parseDateKey } from "@/lib/dates";
import {
  planWeekShift,
  seasonRangesFromDb,
  type ShiftWeekPlan,
} from "@/lib/plan/calendar/shift-week";

export class CalendarShiftError extends Error {
  status: number;
  code?: string;
  preview?: {
    deltaDays: number;
    moveCount: number;
    deleteCount: number;
    wallSeasonName: string | null;
    wallDateKey: string | null;
  };

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string;
      preview?: CalendarShiftError["preview"];
    }
  ) {
    super(message);
    this.name = "CalendarShiftError";
    this.status = status;
    this.code = options?.code;
    this.preview = options?.preview;
  }
}

async function loadAthleteSeasons(athleteId: string) {
  const seasons = await db.seasonPlan.findMany({
    where: { athleteId, status: { not: "ARCHIVED" } },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });
  return seasonRangesFromDb(seasons);
}

async function loadShiftableSessions(
  athleteId: string,
  weekStart: string,
  discipline?: Discipline | null
) {
  const rows = await db.plannedSession.findMany({
    where: {
      athleteId,
      source: { not: "RACE" },
      scheduledDate: { gte: parseDateKey(weekStart) },
      ...(discipline ? { discipline } : {}),
    },
    select: {
      id: true,
      scheduledDate: true,
      discipline: true,
      source: true,
      structuredWorkout: { select: { id: true } },
      linkedActivityId: true,
    },
    orderBy: { scheduledDate: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    scheduledDateKey: formatDateKey(row.scheduledDate),
    discipline: row.discipline,
    source: row.source,
    structuredWorkoutId: row.structuredWorkout?.id ?? null,
    linkedActivityId: row.linkedActivityId,
  }));
}

function previewFromPlan(plan: Extract<ShiftWeekPlan, { ok: true }>) {
  return {
    deltaDays: plan.deltaDays,
    moveCount: plan.moveIds.length,
    deleteCount: plan.deleteIds.length,
    wallSeasonName: plan.wallSeason?.name ?? null,
    wallDateKey: plan.wallDateKey,
  };
}

export async function previewCalendarWeekShift(input: {
  athleteId: string;
  weekStart: string;
  targetDate: string;
  discipline?: Discipline | null;
}) {
  const [seasons, sessions] = await Promise.all([
    loadAthleteSeasons(input.athleteId),
    loadShiftableSessions(input.athleteId, input.weekStart, input.discipline),
  ]);

  const plan = planWeekShift({
    weekStart: input.weekStart,
    targetDate: input.targetDate,
    discipline: input.discipline,
    sessions,
    seasons,
  });

  if (!plan.ok) {
    throw new CalendarShiftError(plan.message, 400, { code: plan.code });
  }

  return previewFromPlan(plan);
}

export async function executeCalendarWeekShift(input: {
  athleteId: string;
  weekStart: string;
  targetDate: string;
  discipline?: Discipline | null;
}) {
  const [seasons, sessions] = await Promise.all([
    loadAthleteSeasons(input.athleteId),
    loadShiftableSessions(input.athleteId, input.weekStart, input.discipline),
  ]);

  const plan = planWeekShift({
    weekStart: input.weekStart,
    targetDate: input.targetDate,
    discipline: input.discipline,
    sessions,
    seasons,
  });

  if (!plan.ok) {
    throw new CalendarShiftError(plan.message, 400, { code: plan.code });
  }

  if (plan.moveIds.length === 0 && plan.deleteIds.length === 0) {
    return {
      ...previewFromPlan(plan),
      moved: 0,
      deleted: 0,
    };
  }

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const deleteWorkoutIds = plan.deleteIds
    .map((id) => byId.get(id)?.structuredWorkoutId)
    .filter((id): id is string => Boolean(id));

  await db.$transaction(async (tx) => {
    if (plan.deleteIds.length > 0) {
      if (deleteWorkoutIds.length > 0) {
        await tx.structuredWorkout.deleteMany({
          where: { id: { in: deleteWorkoutIds } },
        });
      }
      await tx.plannedSession.deleteMany({
        where: { id: { in: plan.deleteIds }, athleteId: input.athleteId },
      });
    }

    for (const id of plan.moveIds) {
      const row = byId.get(id);
      if (!row) continue;
      const nextKey = addDaysToDateKey(row.scheduledDateKey, plan.deltaDays);
      await tx.plannedSession.updateMany({
        where: { id, athleteId: input.athleteId },
        data: { scheduledDate: parseDateKey(nextKey) },
      });
      if (row.linkedActivityId) {
        await tx.plannedSession.update({
          where: { id },
          data: { linkedActivityId: null },
        });
      }
    }
  });

  return {
    ...previewFromPlan(plan),
    moved: plan.moveIds.length,
    deleted: plan.deleteIds.length,
  };
}
