import type { CalendarLinkedActivity, CalendarPlannedSession } from "@/lib/plan/calendar/serialize";

function formatMinutes(minutes: number): string {
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

function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return minutes > 0 ? `${h}:${String(minutes).padStart(2, "0")} ${period}` : `${h} ${period}`;
}

export function formatPlannedSessionCardSummary(session: {
  plannedMinutes: number;
  metricsSummary: string | null;
}): string | null {
  const parts: string[] = [];
  if (session.plannedMinutes > 0) {
    parts.push(formatMinutes(session.plannedMinutes));
  }
  if (session.metricsSummary) {
    parts.push(session.metricsSummary);
  }
  if (parts.length === 0) return null;
  return `Planned ${parts.join(" · ")}`;
}

export function formatLinkedActivityCardSummary(linked: CalendarLinkedActivity): string {
  return `Done ${formatTimeOfDay(linked.startTime)} · ${formatDurationSeconds(linked.durationSeconds)}`;
}

export function formatLinkedSessionCardLines(session: CalendarPlannedSession): string[] {
  const lines: string[] = [];
  const planned = formatPlannedSessionCardSummary(session);
  if (planned) lines.push(planned);
  if (session.linkedActivity) {
    lines.push(formatLinkedActivityCardSummary(session.linkedActivity));
  }
  return lines;
}
