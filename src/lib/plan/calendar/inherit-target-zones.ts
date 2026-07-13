import type { Discipline, SessionRole } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { summarizeWeekPlannedSessions } from "@/lib/plan/calendar/week-summary";
import { zoneKey } from "@/lib/workout/steps";

const ZONES = [1, 2, 3, 4, 5] as const;

/** Share of session minutes by zone for each role (sums to 1). */
const ROLE_ZONE_SHARE: Record<SessionRole, Partial<Record<number, number>>> = {
  EASY: { 1: 0.55, 2: 0.45 },
  MODERATE: { 2: 1 },
  INTENSITY: { 3: 0.55, 4: 0.3, 5: 0.15 },
  LONG: { 1: 0.1, 2: 0.9 },
};

function enduranceDiscipline(
  discipline: Discipline
): discipline is "SWIM" | "BIKE" | "RUN" {
  return discipline === "SWIM" || discipline === "BIKE" || discipline === "RUN";
}

function remainingZoneMinutes(
  discipline: Discipline,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): Record<number, number> {
  const planned = summarizeWeekPlannedSessions(sessions);
  const plannedRow = planned.bySport.find((row) => row.discipline === discipline);
  const remaining: Record<number, number> = {};

  for (const zone of ZONES) {
    const key = zoneKey(discipline, zone);
    const target = weekTarget.zoneMinutes[key] ?? 0;
    const done = plannedRow?.zoneMinutes[key] ?? 0;
    remaining[zone] = Math.max(0, target - done);
  }

  return remaining;
}

function estimateSessionMinutes(
  discipline: Discipline,
  weekTarget: CalendarWeekTarget,
  remainingZone: Record<number, number>,
  unscheduledCount: number
): number {
  const remainingTotal = ZONES.reduce((sum, z) => sum + remainingZone[z], 0);
  if (remainingTotal > 0 && unscheduledCount > 0) {
    return remainingTotal / unscheduledCount;
  }

  const entry = weekTarget.byDiscipline.find((row) => row.discipline === discipline);
  if (entry && entry.sessionsPerWeek > 0 && entry.hours > 0) {
    return (entry.hours * 60) / entry.sessionsPerWeek;
  }

  return 0;
}

/**
 * Hybrid TiZ on skeleton place: inherit provisional targetZones from session role
 * and a fair share of the discipline's remaining week zone budget.
 */
export function inheritTargetZonesFromRole(input: {
  sessionRole: SessionRole;
  discipline: Discipline;
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  /** Unscheduled chips left for this discipline (including the one being placed). */
  unscheduledCount: number;
}): Record<string, number> | undefined {
  const { sessionRole, discipline, weekTarget, sessions, unscheduledCount } = input;

  if (!enduranceDiscipline(discipline)) return undefined;

  const remainingZone = remainingZoneMinutes(discipline, weekTarget, sessions);
  const sessionMinutes = estimateSessionMinutes(
    discipline,
    weekTarget,
    remainingZone,
    Math.max(1, unscheduledCount)
  );

  if (sessionMinutes <= 0) return undefined;

  const shares = ROLE_ZONE_SHARE[sessionRole];
  const targetZones: Record<string, number> = {};
  let allocated = 0;

  for (const zone of ZONES) {
    const share = shares[zone] ?? 0;
    if (share <= 0) continue;
    const minutes = Math.round(sessionMinutes * share);
    if (minutes > 0) {
      targetZones[String(zone)] = minutes;
      allocated += minutes;
    }
  }

  const remainder = Math.round(sessionMinutes) - allocated;
  if (remainder > 0) {
    const fallbackZone =
      sessionRole === "INTENSITY" ? "3" : sessionRole === "EASY" ? "1" : "2";
    targetZones[fallbackZone] = (targetZones[fallbackZone] ?? 0) + remainder;
  }

  return Object.keys(targetZones).length > 0 ? targetZones : undefined;
}
