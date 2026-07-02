import type { Discipline } from "@prisma/client";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { CalendarLinkedActivity, CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { DisplayUnit } from "@/lib/workout/metrics";

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;
const YARDS_PER_METER = 1 / 0.9144;

const CARD_METRIC_SEP = "|";

export function formatCardDuration(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  if (rounded <= 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatDurationSeconds(seconds: number): string {
  return formatCardDuration(seconds / 60);
}

function formatKSuffix(value: number): string {
  const k = Math.round((value / 1000) * 10) / 10;
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
}

export function formatCardDistance(
  meters: number | null | undefined,
  discipline: Discipline,
  displayUnit: DisplayUnit
): string | null {
  if (!meters || meters <= 0) return null;

  if (discipline === "SWIM") {
    const raw = displayUnit === "METRIC" ? meters : meters * YARDS_PER_METER;
    if (raw >= 1000) return formatKSuffix(raw);
    const unit = displayUnit === "METRIC" ? "m" : "yd";
    return `${Math.round(raw)}${unit}`;
  }

  if (displayUnit === "METRIC") {
    if (meters >= METERS_PER_KM) return formatKSuffix(meters);
    return `${Math.round(meters)}m`;
  }

  const miles = meters / METERS_PER_MILE;
  const rounded = Math.round(miles * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}mi` : `${rounded.toFixed(1)}mi`;
}

export function isRedundantCalendarActivityTitle(name: string, discipline: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  const label =
    DISCIPLINE_DISPLAY_LABELS[discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ?? discipline;
  const lower = trimmed.toLowerCase();
  const labelLower = label.toLowerCase();
  if (lower === labelLower) return true;
  if (lower.startsWith(`${labelLower} `)) return true;
  if (discipline === "SWIM" && /pool swim|lap swimming|open water/i.test(trimmed)) return true;
  return false;
}

function plannedDurationMinutes(session: CalendarPlannedSession): number | null {
  if (session.plannedMinutes > 0) return session.plannedMinutes;
  if (session.source === "RACE" && session.estimatedDurationMinutes != null && session.estimatedDurationMinutes > 0) {
    return session.estimatedDurationMinutes;
  }
  return null;
}

function completedDurationSeconds(session: CalendarPlannedSession): number | null {
  if (session.completedDurationMinutes != null && session.completedDurationMinutes > 0) {
    return session.completedDurationMinutes * 60;
  }
  const linked = session.linkedActivity;
  if (!linked) return null;
  if (linked.movingSeconds != null && linked.movingSeconds > 0) {
    return linked.movingSeconds;
  }
  return linked.durationSeconds > 0 ? linked.durationSeconds : null;
}

function completedDistanceMeters(session: CalendarPlannedSession): number | null {
  if (session.completedDistanceMeters != null && session.completedDistanceMeters > 0) {
    return session.completedDistanceMeters;
  }
  const linked = session.linkedActivity;
  if (!linked?.distanceMeters || linked.distanceMeters <= 0) return null;
  return linked.distanceMeters;
}

function formatMetricComparison(
  planned: string | null,
  completed: string | null
): string | null {
  if (planned && completed) return `${planned}→${completed}`;
  return completed ?? planned;
}

export function formatSessionCardMetricComparison(
  session: CalendarPlannedSession,
  displayUnit: DisplayUnit
): { duration: string | null; distance: string | null } {
  const discipline = session.discipline as Discipline;

  const plannedMinutes = plannedDurationMinutes(session);
  const plannedDur =
    plannedMinutes != null ? formatCardDuration(plannedMinutes) : null;
  const completedDurSec = completedDurationSeconds(session);
  const completedDur =
    completedDurSec != null ? formatDurationSeconds(completedDurSec) : null;

  const plannedDist =
    session.distanceMeters != null && session.distanceMeters > 0
      ? formatCardDistance(session.distanceMeters, discipline, displayUnit)
      : null;
  const completedDistM = completedDistanceMeters(session);
  const completedDist =
    completedDistM != null
      ? formatCardDistance(completedDistM, discipline, displayUnit)
      : null;

  if (session.linkedActivity) {
    return {
      duration: formatMetricComparison(plannedDur, completedDur),
      distance: formatMetricComparison(plannedDist, completedDist),
    };
  }

  return { duration: plannedDur, distance: plannedDist };
}

export function formatSessionCardMetricLines(
  session: CalendarPlannedSession,
  displayUnit: DisplayUnit
): string[] {
  const { duration, distance } = formatSessionCardMetricComparison(session, displayUnit);

  const parts = [duration, distance].filter((part): part is string => part != null);
  if (parts.length === 0) return [];
  return [parts.join(CARD_METRIC_SEP)];
}

export function formatActivityCardMetricLines(
  activity: {
    discipline: string;
    durationSeconds: number;
    distanceMeters: number | null;
  },
  displayUnit: DisplayUnit
): string[] {
  const parts: string[] = [];
  if (activity.durationSeconds > 0) {
    parts.push(formatDurationSeconds(activity.durationSeconds));
  }
  const dist = formatCardDistance(
    activity.distanceMeters,
    activity.discipline as Discipline,
    displayUnit
  );
  if (dist) parts.push(dist);
  if (parts.length === 0) return [];
  return [parts.join(CARD_METRIC_SEP)];
}

/** @deprecated Use formatSessionCardMetricLines */
export function formatPlannedSessionCardSummary(session: {
  plannedMinutes: number;
  metricsSummary: string | null;
}): string | null {
  const parts: string[] = [];
  if (session.plannedMinutes > 0) {
    parts.push(formatCardDuration(session.plannedMinutes));
  }
  if (session.metricsSummary) {
    parts.push(session.metricsSummary);
  }
  if (parts.length === 0) return null;
  return `Planned ${parts.join(" · ")}`;
}

/** @deprecated Use formatSessionCardMetricLines */
export function formatLinkedActivityCardSummary(linked: CalendarLinkedActivity): string {
  const seconds =
    linked.movingSeconds != null && linked.movingSeconds > 0
      ? linked.movingSeconds
      : linked.durationSeconds;
  return `Done · ${formatDurationSeconds(seconds)}`;
}

/** @deprecated Use formatSessionCardMetricLines */
export function formatLinkedSessionCardLines(
  session: CalendarPlannedSession,
  displayUnit: DisplayUnit = "METRIC"
): string[] {
  return formatSessionCardMetricLines(session, displayUnit);
}
