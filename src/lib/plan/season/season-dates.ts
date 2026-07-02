import { addDays, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { calendarDateFromDb, formatDateKey, parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { DRAFT_LEAD_DAYS } from "./constants";
import type {
  DateRange,
  DerivedSeasonStatus,
  SeasonDateBounds,
  SeasonOverlapCheck,
} from "./types";

/** Snap season start to the Monday of its week. */
export function snapStartToMonday(date: Date): Date {
  const key = formatDateKey(calendarDateFromDb(date));
  return parseDateKey(format(startOfWeek(parseDateKey(key), WEEK_OPTS), "yyyy-MM-dd"));
}

/** Snap season end to the Sunday of its week. */
export function snapEndToSunday(date: Date): Date {
  const monday = snapStartToMonday(date);
  return addDays(monday, 6);
}

export function normalizeSeasonDateRange(startDate: Date, endDate: Date): DateRange {
  const start = snapStartToMonday(startDate);
  let end = snapEndToSunday(endDate);
  if (end < start) {
    end = addDays(start, 6);
  }
  return { startDate: start, endDate: end };
}

/** Inclusive Monday-start weeks between snapped bounds. */
export function computeTotalWeeks(startDate: Date, endDate: Date): number {
  const { startDate: start, endDate: end } = normalizeSeasonDateRange(startDate, endDate);
  const days = differenceInCalendarDays(end, start) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

export function weekStartDateForIndex(seasonStart: Date, weekIndex: number): Date {
  return addDays(snapStartToMonday(seasonStart), weekIndex * 7);
}

/** Month labels at the first week each calendar month appears on the timeline. */
export function monthTicksForWeeks(
  seasonStart: Date,
  displayWeeks: number
): { weekIndex: number; label: string }[] {
  const ticks: { weekIndex: number; label: string }[] = [];
  let previousMonth = "";
  for (let weekIndex = 0; weekIndex < displayWeeks; weekIndex++) {
    const month = format(weekStartDateForIndex(seasonStart, weekIndex), "MMM");
    if (month !== previousMonth) {
      ticks.push({ weekIndex, label: month });
      previousMonth = month;
    }
  }
  return ticks;
}

export function buildSeasonDateBounds(startDate: Date, endDate: Date): SeasonDateBounds {
  const normalized = normalizeSeasonDateRange(startDate, endDate);
  return {
    ...normalized,
    totalWeeks: computeTotalWeeks(normalized.startDate, normalized.endDate),
  };
}

function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function seasonRangesOverlap(
  candidate: SeasonOverlapCheck,
  existing: SeasonOverlapCheck
): boolean {
  if (candidate.id && existing.id && candidate.id === existing.id) {
    return false;
  }
  const a = normalizeSeasonDateRange(candidate.startDate, candidate.endDate);
  const b = normalizeSeasonDateRange(existing.startDate, existing.endDate);
  return rangesOverlap(a, b);
}

export function findOverlappingSeason<T extends SeasonOverlapCheck>(
  candidate: SeasonOverlapCheck,
  seasons: T[]
): T | undefined {
  return seasons.find((season) => seasonRangesOverlap(candidate, season));
}

/**
 * DRAFT when start is more than 28 days away; ACTIVE within 4 weeks of start;
 * COMPLETED after end date.
 */
export function deriveSeasonStatus(
  startDate: Date,
  endDate: Date,
  today: Date = new Date()
): DerivedSeasonStatus {
  const todayKey = formatDateKey(calendarDateFromDb(today));
  const todayDate = parseDateKey(todayKey);
  const { startDate: start, endDate: end } = normalizeSeasonDateRange(startDate, endDate);

  if (todayDate > end) {
    return "COMPLETED";
  }
  const draftThreshold = addDays(todayDate, DRAFT_LEAD_DAYS);
  if (start > draftThreshold) {
    return "DRAFT";
  }
  return "ACTIVE";
}
