import type { Weekday } from "@prisma/client";
import { addDays, format, parseISO, startOfDay, startOfWeek } from "date-fns";
import { normalizeWeekStart, parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { db } from "@/lib/db";

const WEEKDAY_OFFSET: Record<Weekday, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

export type AnchorSchedule = {
  effectiveFrom: string;
  effectiveUntil?: string | null;
  skippedDates?: string[];
};

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

/** Map a weekday to a concrete date in the Monday-start week containing weekStart. */
export function weekdayToDate(weekStart: string, weekday: Weekday): string {
  const monday = normalizeWeekStart(weekStart);
  const start = parseDateKey(monday);
  return format(addDays(start, WEEKDAY_OFFSET[weekday]), "yyyy-MM-dd");
}

export function anchorActiveOnDate(anchor: AnchorSchedule, dateKey: string): boolean {
  const d = startOfDay(parseISO(`${dateKey}T12:00:00`));
  const from = startOfDay(parseISO(`${anchor.effectiveFrom}T12:00:00`));
  if (d < from) return false;
  if (anchor.effectiveUntil) {
    const until = startOfDay(parseISO(`${anchor.effectiveUntil}T12:00:00`));
    if (d > until) return false;
  }
  if (anchor.skippedDates?.includes(dateKey)) return false;
  return true;
}

export async function materializeAnchorsForWeek(athleteId: string, weekStart: Date) {
  const weekKey = format(startOfWeek(weekStart, WEEK_OPTS), "yyyy-MM-dd");
  const weekEnd = addDays(startOfWeek(weekStart, WEEK_OPTS), 6);
  const anchors = await db.anchorWorkout.findMany({
    where: {
      athleteId,
      effectiveFrom: { lte: weekEnd },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: startOfWeek(weekStart, WEEK_OPTS) } }],
    },
  });

  for (const anchor of anchors) {
    const schedule: AnchorSchedule = {
      effectiveFrom: format(anchor.effectiveFrom, "yyyy-MM-dd"),
      effectiveUntil: anchor.effectiveUntil ? format(anchor.effectiveUntil, "yyyy-MM-dd") : null,
      skippedDates: Array.isArray(anchor.skippedDates)
        ? (anchor.skippedDates as string[])
        : [],
    };
    const dateKey = weekdayToDate(weekKey, anchor.weekday);
    if (!anchorActiveOnDate(schedule, dateKey)) continue;

    const scheduledDate = startOfDay(parseISO(`${dateKey}T12:00:00`));
    await db.plannedSession.upsert({
      where: {
        athleteId_anchorWorkoutId_scheduledDate: {
          athleteId,
          anchorWorkoutId: anchor.id,
          scheduledDate,
        },
      },
      create: {
        id: cuid(),
        athleteId,
        anchorWorkoutId: anchor.id,
        scheduledDate,
        discipline: anchor.discipline,
        title: anchor.title,
        targetZones: anchor.targetZones ?? undefined,
        distanceMeters: anchor.distanceMeters,
        targetSpeedMps: anchor.targetSpeedMps,
        targetPaceSeconds: anchor.targetPaceSeconds,
        source: "ANCHORED_INSTANCE",
      },
      update: {
        title: anchor.title,
        targetZones: anchor.targetZones ?? undefined,
        distanceMeters: anchor.distanceMeters,
        targetSpeedMps: anchor.targetSpeedMps,
        targetPaceSeconds: anchor.targetPaceSeconds,
      },
    });
  }
}

export async function detachSessionFromAnchor(sessionId: string, athleteId: string) {
  await db.plannedSession.updateMany({
    where: { id: sessionId, athleteId, source: "ANCHORED_INSTANCE" },
    data: { anchorWorkoutId: null, source: "FLEXIBLE" },
  });
}
