import { endOfDay, format, parseISO, startOfDay, startOfWeek } from "date-fns";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse yyyy-MM-dd as a local calendar date (noon anchor avoids DST/UTC drift).
 */
export function parseDateKey(dateKey: string): Date {
  return startOfDay(parseISO(`${dateKey}T12:00:00`));
}

/** End of local calendar day for yyyy-MM-dd (inclusive upper bound for timestamps). */
export function endDateKey(dateKey: string): Date {
  return endOfDay(parseDateKey(dateKey));
}

/**
 * Format a DB @db.Date value as yyyy-MM-dd without timezone shift.
 */
export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calendar day key for an activity in the timezone where it was completed.
 * When `utcOffsetSeconds` is missing, falls back to the UTC calendar day of `startTime`.
 */
export function activityLocalDateKey(
  startTime: Date,
  utcOffsetSeconds?: number | null
): string {
  const offsetMs =
    utcOffsetSeconds != null && Number.isFinite(utcOffsetSeconds)
      ? utcOffsetSeconds * 1000
      : 0;
  return new Date(startTime.getTime() + offsetMs).toISOString().slice(0, 10);
}

/** Next yyyy-MM-dd after `dateKey` (UTC noon stepping; no server-TZ drift). */
export function nextDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Inclusive range of yyyy-MM-dd keys from `from` through `to`. */
export function eachDateKey(from: string, to: string): string[] {
  if (!DATE_KEY_RE.test(from) || !DATE_KEY_RE.test(to) || from > to) return [];
  const keys: string[] = [];
  let cur = from;
  while (cur <= to) {
    keys.push(cur);
    cur = nextDateKey(cur);
  }
  return keys;
}

/** Monday yyyy-MM-dd for the week containing dateKey. */
export function normalizeWeekStart(dateKey: string): string {
  return format(startOfWeek(parseISO(`${dateKey}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd");
}

/** Local calendar date for display/formatting of a DB @db.Date value. */
export function calendarDateFromDb(date: Date): Date {
  return parseDateKey(formatDateKey(date));
}

export { WEEK_OPTS };
