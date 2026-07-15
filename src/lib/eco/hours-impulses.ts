import { formatDateKey, nextDateKey } from "@/lib/dates";
import type { EcoImpulse } from "@/lib/eco/fitness-fatigue";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import type { ZoneMinutes } from "@/lib/workout/steps";
import { totalZoneMinutes } from "@/lib/workout/steps";
import type { Discipline } from "@prisma/client";

export type PlannedSessionForHours = {
  id: string;
  scheduledDate: Date;
  discipline: Discipline;
  targetZones?: unknown;
  durationMinutes?: number | null;
  zoneAllocationMissing?: boolean;
  structuredSteps?: unknown;
  linkedActivityHasHours?: boolean;
};

export type SeasonWeekForHours = {
  weekStartDate: string;
  zoneMinutes: ZoneMinutes;
  isRestWeek?: boolean;
};

function impulseAtDateKey(dateKey: string, discipline: string, hours: number): EcoImpulse {
  return {
    startTime: new Date(`${dateKey}T12:00:00.000Z`),
    utcOffsetSeconds: 0,
    discipline,
    ecos: hours,
  };
}

function addDaysKey(dateKey: string, days: number): string {
  let cur = dateKey;
  for (let i = 0; i < days; i++) cur = nextDateKey(cur);
  return cur;
}

/** Prefer TiZ hours; fall back to duration hours. */
export function hoursFromTiZOrDuration(options: {
  zoneMinutes?: ZoneMinutes | null;
  durationMinutes?: number | null;
  durationSeconds?: number | null;
}): number {
  const tiz = options.zoneMinutes ? totalZoneMinutes(options.zoneMinutes) : 0;
  if (tiz > 0) return tiz / 60;
  if (options.durationMinutes != null && options.durationMinutes > 0) {
    return options.durationMinutes / 60;
  }
  if (options.durationSeconds != null && options.durationSeconds > 0) {
    return options.durationSeconds / 3600;
  }
  return 0;
}

function plannedSessionHours(session: PlannedSessionForHours): number {
  if (
    session.discipline !== "SWIM" &&
    session.discipline !== "BIKE" &&
    session.discipline !== "RUN"
  ) {
    return 0;
  }

  if (!session.zoneAllocationMissing) {
    const rollup = sessionPlannedZoneRollup(session.discipline, {
      targetZones: session.targetZones,
      structuredSteps: session.structuredSteps,
      durationHintMinutes: session.durationMinutes,
    });
    if (!rollup.zoneAllocationMissing && rollup.totalMinutes > 0) {
      return rollup.totalMinutes / 60;
    }
  }

  return hoursFromTiZOrDuration({ durationMinutes: session.durationMinutes });
}

/**
 * Project planned session TiZ/hours for today (if not covered) and future days.
 */
export function plannedHoursImpulses(options: {
  sessions: PlannedSessionForHours[];
  todayKey: string;
}): EcoImpulse[] {
  const { sessions, todayKey } = options;
  const impulses: EcoImpulse[] = [];

  for (const session of sessions) {
    const dateKey = formatDateKey(session.scheduledDate);
    if (dateKey < todayKey) continue;
    if (dateKey === todayKey && session.linkedActivityHasHours) continue;

    const hours = plannedSessionHours(session);
    if (!(hours > 0)) continue;
    impulses.push(impulseAtDateKey(dateKey, session.discipline, hours));
  }

  return impulses;
}

/**
 * Project weekly season TiZ budgets as hours on week-start Mondays.
 */
export function seasonWeekHoursImpulses(options: {
  weeks: SeasonWeekForHours[];
  todayKey: string;
}): EcoImpulse[] {
  const { weeks, todayKey } = options;
  const impulses: EcoImpulse[] = [];

  for (const week of weeks) {
    if (week.isRestWeek) continue;
    const weekEnd = addDaysKey(week.weekStartDate, 6);
    if (weekEnd < todayKey) continue;

    for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
      const minutes = Object.entries(week.zoneMinutes)
        .filter(([key]) => key.startsWith(`${discipline}-`))
        .reduce((sum, [, m]) => sum + (m > 0 ? m : 0), 0);
      if (!(minutes > 0)) continue;
      impulses.push(impulseAtDateKey(week.weekStartDate, discipline, minutes / 60));
    }
  }

  return impulses;
}
