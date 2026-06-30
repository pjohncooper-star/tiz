import type { Discipline } from "@prisma/client";
import type { SummaryStat } from "@/lib/activity/summary";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import { formatPlannedDuration } from "@/lib/plan/session-stats";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  formatSessionDistance,
  formatSessionPace,
  formatSessionSpeed,
} from "@/lib/workout/metrics";
import {
  formatZoneMinutes,
  parseTargetZones,
  totalZoneMinutes,
  zoneKey,
  type ZoneMinutes,
} from "@/lib/workout/steps";

export type SessionCompletionFields = {
  completedDurationMinutes?: number | null;
  completedDistanceMeters?: number | null;
  completedTargetSpeedMps?: number | null;
  completedTargetPaceSeconds?: number | null;
  completedZones?: unknown;
  linkedActivityId?: string | null;
};

export function hasSessionCompletionOverride(
  session: SessionCompletionFields
): boolean {
  if (
    session.completedDurationMinutes != null &&
    session.completedDurationMinutes > 0
  ) {
    return true;
  }
  if (
    session.completedDistanceMeters != null &&
    session.completedDistanceMeters > 0
  ) {
    return true;
  }
  if (
    session.completedTargetSpeedMps != null &&
    session.completedTargetSpeedMps > 0
  ) {
    return true;
  }
  if (
    session.completedTargetPaceSeconds != null &&
    session.completedTargetPaceSeconds > 0
  ) {
    return true;
  }
  return totalZoneMinutes(parseTargetZones(session.completedZones)) > 0;
}

export function sessionCompletionToTriad(
  session: SessionCompletionFields,
  discipline: Discipline
): PlannedMetricsTriadValues {
  return {
    durationMinutes: session.completedDurationMinutes ?? null,
    distanceMeters: session.completedDistanceMeters ?? null,
    targetSpeedMps:
      discipline === "BIKE" ? session.completedTargetSpeedMps ?? null : null,
    targetPaceSeconds:
      discipline === "BIKE" ? null : session.completedTargetPaceSeconds ?? null,
  };
}

export function completedZonesToDisciplineZoneMinutes(
  raw: unknown,
  discipline: Discipline
): ZoneMinutes {
  const parsed = parseTargetZones(raw);
  const zoneMinutes: ZoneMinutes = {};
  for (const [zone, minutes] of Object.entries(parsed)) {
    if (minutes > 0) {
      zoneMinutes[zoneKey(discipline, Number(zone))] = minutes;
    }
  }
  return zoneMinutes;
}

function buildStatsFromTriad(
  discipline: Discipline,
  displayUnit: DisplayUnit,
  triad: PlannedMetricsTriadValues,
  zoneMinutes: ZoneMinutes
): SummaryStat[] {
  const stats: SummaryStat[] = [];

  if (triad.durationMinutes != null && triad.durationMinutes > 0) {
    const label = discipline === "SWIM" ? "Elapsed" : "Duration";
    stats.push({
      label,
      value: formatPlannedDuration(triad.durationMinutes),
    });
  }

  const distance = formatSessionDistance(
    triad.distanceMeters,
    discipline,
    displayUnit
  );
  if (distance) {
    stats.push({ label: "Distance", value: distance });
  }

  if (discipline === "BIKE") {
    const speed = formatSessionSpeed(triad.targetSpeedMps, displayUnit);
    if (speed) stats.push({ label: "Avg speed", value: speed });
  } else if (discipline === "RUN" || discipline === "SWIM") {
    const pace = formatSessionPace(
      triad.targetPaceSeconds,
      discipline,
      displayUnit
    );
    if (pace) stats.push({ label: "Avg pace", value: pace });
  }

  const zoneTotal = totalZoneMinutes(zoneMinutes);
  if (zoneTotal > 0) {
    stats.push({ label: "Zone time", value: formatZoneMinutes(zoneTotal) });
  }

  return stats;
}

export function buildCompletedSnapshotFromSession(
  session: SessionCompletionFields,
  discipline: Discipline,
  displayUnit: DisplayUnit
): CompletedSessionSnapshot {
  const triad = sessionCompletionToTriad(session, discipline);
  const zoneMinutes = completedZonesToDisciplineZoneMinutes(
    session.completedZones,
    discipline
  );

  return {
    stats: buildStatsFromTriad(discipline, displayUnit, triad, zoneMinutes),
    zoneMinutes,
    activities: [],
    canonical: triad,
  };
}

export function zoneDurationBudgetMinutes(
  durationMinutes: number | null | undefined
): number | null {
  if (durationMinutes == null || durationMinutes <= 0) return null;
  return Math.ceil(durationMinutes);
}

export function validateCompletedZoneAllocation(
  zones: Partial<Record<number, number>>,
  durationMinutes: number | null
): string | null {
  const zoneSum = Object.values(zones).reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0);
  const budgetMinutes = zoneDurationBudgetMinutes(durationMinutes);
  if (budgetMinutes != null && zoneSum > budgetMinutes) {
    return "Completed zone minutes cannot exceed duration";
  }
  return null;
}

export type SessionCompletionRollup = {
  discipline: Discipline;
  durationMinutes: number;
  distanceMeters: number;
  zoneMinutes: ZoneMinutes;
};

/** Week rollup contribution from a session with manual/override completion. */
export function sessionCompletionRollup(
  session: SessionCompletionFields & { discipline: Discipline }
): SessionCompletionRollup | null {
  if (!hasSessionCompletionOverride(session)) return null;

  const triad = sessionCompletionToTriad(session, session.discipline);
  const zoneMinutes = completedZonesToDisciplineZoneMinutes(
    session.completedZones,
    session.discipline
  );

  return {
    discipline: session.discipline,
    durationMinutes: triad.durationMinutes ?? 0,
    distanceMeters: triad.distanceMeters ?? 0,
    zoneMinutes,
  };
}
