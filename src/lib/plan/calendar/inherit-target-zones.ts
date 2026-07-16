import type { Discipline, SessionRole } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
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

function longDiscipline(discipline: Discipline): discipline is "BIKE" | "RUN" {
  return discipline === "BIKE" || discipline === "RUN";
}

function plannedLongZoneMinutes(
  discipline: "BIKE" | "RUN",
  sessions: CalendarPlannedSession[]
): Record<number, number> {
  const done: Record<number, number> = {};
  for (const session of sessions) {
    if (session.discipline !== discipline || session.sessionRole !== "LONG") continue;
    for (const [key, minutes] of Object.entries(session.zoneMinutes)) {
      const match = key.match(/-(\d)$/);
      if (!match) continue;
      const zone = Number(match[1]);
      done[zone] = (done[zone] ?? 0) + minutes;
    }
  }
  return done;
}

function remainingLongSessionZoneMinutes(
  discipline: "BIKE" | "RUN",
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): Record<number, number> {
  const longZones = weekTarget.longSessionZoneMinutes ?? {};
  const done = plannedLongZoneMinutes(discipline, sessions);
  const remaining: Record<number, number> = {};

  for (const zone of ZONES) {
    const key = zoneKey(discipline, zone);
    const target = longZones[key] ?? 0;
    remaining[zone] = Math.max(0, target - (done[zone] ?? 0));
  }

  return remaining;
}

function remainingZoneMinutes(
  discipline: Discipline,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): Record<number, number> {
  const remaining: Record<number, number> = {};

  for (const zone of ZONES) {
    const key = zoneKey(discipline, zone);
    const target = weekTarget.zoneMinutes[key] ?? 0;
    let done = 0;
    for (const session of sessions) {
      if (session.discipline !== discipline) continue;
      if (session.sessionRole === "LONG" && longDiscipline(discipline)) continue;
      done += session.zoneMinutes[key] ?? 0;
    }
    remaining[zone] = Math.max(0, target - done);
  }

  return remaining;
}

function estimateSessionMinutes(
  discipline: Discipline,
  weekTarget: CalendarWeekTarget,
  remainingZone: Record<number, number>,
  unscheduledCount: number,
  targetDurationMinutes?: number
): number {
  if (targetDurationMinutes != null && targetDurationMinutes > 0) {
    return targetDurationMinutes;
  }

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

function zonesFromShares(
  sessionMinutes: number,
  shares: Partial<Record<number, number>>,
  sessionRole: SessionRole
): Record<string, number> {
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

  return targetZones;
}

function inheritLongSessionTargetZones(input: {
  discipline: "BIKE" | "RUN";
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  targetDurationMinutes?: number;
}): Record<string, number> | undefined {
  const remainingLong = remainingLongSessionZoneMinutes(
    input.discipline,
    input.weekTarget,
    input.sessions
  );
  const remainingTotal = ZONES.reduce((sum, z) => sum + remainingLong[z], 0);
  if (remainingTotal <= 0) return undefined;

  const targetZones: Record<string, number> = {};
  let allocated = 0;
  for (const zone of ZONES) {
    const minutes = remainingLong[zone] ?? 0;
    if (minutes > 0) {
      targetZones[String(zone)] = minutes;
      allocated += minutes;
    }
  }

  if (input.targetDurationMinutes != null && input.targetDurationMinutes > 0) {
    const scale = input.targetDurationMinutes / Math.max(1, allocated);
    if (Math.abs(scale - 1) > 0.01) {
      let scaledAllocated = 0;
      for (const zone of ZONES) {
        const key = String(zone);
        if (targetZones[key] == null) continue;
        targetZones[key] = Math.round(targetZones[key]! * scale);
        scaledAllocated += targetZones[key]!;
      }
      const remainder = input.targetDurationMinutes - scaledAllocated;
      if (remainder !== 0) {
        const fallback = targetZones["2"] != null ? "2" : "1";
        targetZones[fallback] = (targetZones[fallback] ?? 0) + remainder;
      }
    }
  }

  return Object.keys(targetZones).length > 0 ? targetZones : undefined;
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
  /** Optional duration from typed pool chip (long / substitute). */
  targetDurationMinutes?: number;
}): Record<string, number> | undefined {
  const {
    sessionRole,
    discipline,
    weekTarget,
    sessions,
    unscheduledCount,
    targetDurationMinutes,
  } = input;

  if (!enduranceDiscipline(discipline)) return undefined;

  if (
    sessionRole === "LONG" &&
    longDiscipline(discipline) &&
    weekTarget.planningMode === "SEPARATE_LONG_TIZ" &&
    Object.keys(weekTarget.longSessionZoneMinutes ?? {}).length > 0
  ) {
    return inheritLongSessionTargetZones({
      discipline,
      weekTarget,
      sessions,
      targetDurationMinutes,
    });
  }

  const remainingZone = remainingZoneMinutes(discipline, weekTarget, sessions);
  const sessionMinutes = estimateSessionMinutes(
    discipline,
    weekTarget,
    remainingZone,
    Math.max(1, unscheduledCount),
    targetDurationMinutes
  );

  if (sessionMinutes <= 0) return undefined;

  const shares = ROLE_ZONE_SHARE[sessionRole];
  const targetZones = zonesFromShares(sessionMinutes, shares, sessionRole);

  return Object.keys(targetZones).length > 0 ? targetZones : undefined;
}
