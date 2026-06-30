import { format, parseISO, startOfDay, startOfWeek } from "date-fns";

const WEEK_OPTS = { weekStartsOn: 1 as const };

/**
 * Parse yyyy-MM-dd as a local calendar date (noon anchor avoids DST/UTC drift).
 */
export function parseDateKey(dateKey: string): Date {
  return startOfDay(parseISO(`${dateKey}T12:00:00`));
}

/**
 * Format a DB @db.Date value as yyyy-MM-dd without timezone shift.
 */
export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
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
