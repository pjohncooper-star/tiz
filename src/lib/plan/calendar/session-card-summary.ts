import type { Discipline } from "@prisma/client";
import type { CalendarLinkedActivity, CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { DisplayUnit } from "@/lib/workout/metrics";
import { formatSessionDistance } from "@/lib/workout/metrics";

function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.round(minutes)}m`;
}

function formatDurationSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
  if (planned && completed) return `${planned} → ${completed}`;
  return completed ?? planned;
}

export function formatSessionCardMetricComparison(
  session: CalendarPlannedSession,
  displayUnit: DisplayUnit
): { duration: string | null; distance: string | null } {
  const discipline = session.discipline as Discipline;

  const plannedDur =
    plannedDurationMinutes(session) != null
      ? formatDurationMinutes(plannedDurationMinutes(session)!)
      : null;
  const completedDurSec = completedDurationSeconds(session);
  const completedDur =
    completedDurSec != null ? formatDurationSeconds(completedDurSec) : null;

  const plannedDist =
    session.distanceMeters != null && session.distanceMeters > 0
      ? formatSessionDistance(session.distanceMeters, discipline, displayUnit)
      : null;
  const completedDistM = completedDistanceMeters(session);
  const completedDist =
    completedDistM != null
      ? formatSessionDistance(completedDistM, discipline, displayUnit)
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

  if (session.linkedActivity) {
    const lines: string[] = [];
    if (duration) lines.push(duration);
    if (distance) lines.push(distance);
    return lines;
  }

  const parts: string[] = [];
  if (duration) parts.push(duration);
  if (distance) parts.push(distance);
  if (parts.length === 0) return [];
  return [parts.join(" · ")];
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
  const dist = formatSessionDistance(activity.distanceMeters, activity.discipline as Discipline, displayUnit);
  if (dist) parts.push(dist);
  if (parts.length === 0) return [];
  return [parts.join(" · ")];
}

/** @deprecated Use formatSessionCardMetricLines */
export function formatPlannedSessionCardSummary(session: {
  plannedMinutes: number;
  metricsSummary: string | null;
}): string | null {
  const parts: string[] = [];
  if (session.plannedMinutes > 0) {
    parts.push(formatDurationMinutes(session.plannedMinutes));
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



