import type { Weekday } from "@prisma/client";
import { addDays, format } from "date-fns";
import { normalizeWeekStart, parseDateKey } from "@/lib/dates";

const WEEKDAY_OFFSET: Record<Weekday, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

/** Map a weekday to a concrete date in the Monday-start week containing weekStart. */
export function weekdayToDate(weekStart: string, weekday: Weekday): string {
  const monday = normalizeWeekStart(weekStart);
  const start = parseDateKey(monday);
  return format(addDays(start, WEEKDAY_OFFSET[weekday]), "yyyy-MM-dd");
}
