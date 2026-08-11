import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { formatScheduledTimeMinutes } from "@/lib/plan/session-day-order";
import type { Discipline } from "@prisma/client";

export type IcalFeedSession = {
  id: string;
  title: string;
  notes: string | null;
  discipline: Discipline;
  scheduledDate: string; // yyyy-MM-dd
  scheduledTimeMinutes: number | null;
  estimatedDurationMinutes: number | null;
};

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcalLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}

/** UTC stamp like 20260810T130000Z */
export function formatIcalUtcStamp(date = new Date()): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

function dateKeyToIcalDate(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

function buildDtStart(session: IcalFeedSession): { line: string; allDay: boolean } {
  if (session.scheduledTimeMinutes == null) {
    return {
      line: `DTSTART;VALUE=DATE:${dateKeyToIcalDate(session.scheduledDate)}`,
      allDay: true,
    };
  }
  const hhmm = formatScheduledTimeMinutes(session.scheduledTimeMinutes)!.replace(":", "");
  return {
    line: `DTSTART:${dateKeyToIcalDate(session.scheduledDate)}T${hhmm}00`,
    allDay: false,
  };
}

function buildDurationOrDtEnd(
  session: IcalFeedSession,
  allDay: boolean
): string | null {
  if (allDay) {
    // All-day events use exclusive DTEND next day when no duration.
    const [y, m, d] = session.scheduledDate.split("-").map(Number);
    const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
    const endKey = next.toISOString().slice(0, 10).replace(/-/g, "");
    return `DTEND;VALUE=DATE:${endKey}`;
  }
  const minutes = session.estimatedDurationMinutes;
  if (minutes != null && minutes > 0) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `DURATION:PT${h}H${m}M`;
    if (h > 0) return `DURATION:PT${h}H`;
    return `DURATION:PT${m}M`;
  }
  return `DURATION:PT1H`;
}

export function buildIcalEvent(
  session: IcalFeedSession,
  options: { siteOrigin: string }
): string {
  const { line: dtStart, allDay } = buildDtStart(session);
  const durationOrEnd = buildDurationOrDtEnd(session, allDay);
  const discipline =
    DISCIPLINE_DISPLAY_LABELS[session.discipline] ?? session.discipline;
  const description = [discipline, session.notes?.trim()].filter(Boolean).join("\n");
  const url = `${options.siteOrigin.replace(/\/$/, "")}/workouts/${session.id}`;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${session.id}@tizplanner`,
    `DTSTAMP:${formatIcalUtcStamp()}`,
    dtStart,
    ...(durationOrEnd ? [durationOrEnd] : []),
    `SUMMARY:${escapeIcalText(session.title)}`,
    `DESCRIPTION:${escapeIcalText(description)}`,
    `URL:${url}`,
    "END:VEVENT",
  ];
  return lines.map(foldIcalLine).join("\r\n");
}

export function buildIcalCalendar(
  sessions: IcalFeedSession[],
  options: { siteOrigin: string; calendarName?: string }
): string {
  const name = options.calendarName ?? "TiZ Planned Workouts";
  const events = sessions.map((s) => buildIcalEvent(s, options)).join("\r\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TiZ//Planned Workouts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(name)}`,
    events,
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.join("\r\n")}\r\n`;
}
