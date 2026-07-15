import { formatDateKey, mondayWeekStartKey, nextDateKey, parseDateKey } from "@/lib/dates";
import { weekIndexForDate, weekStartDateForIndex } from "@/lib/plan/season/season-dates";
import { addDays } from "date-fns";

export const DASHBOARD_RANGE_PRESETS = [
  "last_week",
  "last_two_weeks",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_year",
  "this_season",
  "this_cycle",
  "custom",
] as const;

export type DashboardRangePreset = (typeof DASHBOARD_RANGE_PRESETS)[number];

export const DASHBOARD_RANGE_LABELS: Record<DashboardRangePreset, string> = {
  last_week: "Last week",
  last_two_weeks: "Last two weeks",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  last_year: "Last year",
  this_season: "This season",
  this_cycle: "This cycle",
  custom: "Custom",
};

export type SeasonRangeBounds = {
  startDate: string;
  endDate: string;
};

export type CycleRangeBounds = {
  startDate: string;
  endDate: string;
  name?: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addDaysKey(dateKey: string, days: number): string {
  let cur = dateKey;
  const step = days >= 0 ? 1 : -1;
  const n = Math.abs(days);
  for (let i = 0; i < n; i++) {
    if (step > 0) cur = nextDateKey(cur);
    else {
      const d = new Date(`${cur}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      cur = d.toISOString().slice(0, 10);
    }
  }
  return cur;
}

export function localTodayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDashboardRange(options: {
  preset: DashboardRangePreset;
  todayKey?: string;
  customFrom?: string | null;
  customTo?: string | null;
  season?: SeasonRangeBounds | null;
  cycle?: CycleRangeBounds | null;
}): { from: string; to: string; resolvedPreset: DashboardRangePreset } {
  const today = options.todayKey && DATE_KEY.test(options.todayKey)
    ? options.todayKey
    : localTodayKey();

  if (options.preset === "custom") {
    const from =
      options.customFrom && DATE_KEY.test(options.customFrom)
        ? options.customFrom
        : addDaysKey(today, -29);
    const to =
      options.customTo && DATE_KEY.test(options.customTo) ? options.customTo : today;
    return from <= to
      ? { from, to, resolvedPreset: "custom" }
      : { from: to, to: from, resolvedPreset: "custom" };
  }

  if (options.preset === "this_season") {
    if (options.season) {
      const from = options.season.startDate;
      const to = options.season.endDate < today ? options.season.endDate : today;
      if (DATE_KEY.test(from) && DATE_KEY.test(to) && from <= to) {
        return { from, to, resolvedPreset: "this_season" };
      }
    }
    return resolveDashboardRange({ ...options, preset: "last_3_months" });
  }

  if (options.preset === "this_cycle") {
    if (options.cycle) {
      const from = options.cycle.startDate;
      const to = options.cycle.endDate < today ? options.cycle.endDate : today;
      if (DATE_KEY.test(from) && DATE_KEY.test(to) && from <= to) {
        return { from, to, resolvedPreset: "this_cycle" };
      }
    }
    return resolveDashboardRange({ ...options, preset: "last_month" });
  }

  const daysBack: Record<
    Exclude<DashboardRangePreset, "custom" | "this_season" | "this_cycle">,
    number
  > = {
    last_week: 6,
    last_two_weeks: 13,
    last_month: 29,
    last_3_months: 89,
    last_6_months: 181,
    last_year: 364,
  };

  const from = addDaysKey(today, -daysBack[options.preset]);
  return { from, to: today, resolvedPreset: options.preset };
}

/** Resolve current mesocycle date bounds from season week indices. */
export function cycleBoundsFromSeason(options: {
  seasonStartDate: Date;
  today?: Date;
  mesocycles: Array<{ name: string; startWeekIndex: number; endWeekIndex: number }>;
}): CycleRangeBounds | null {
  const today = options.today ?? new Date();
  const weekIndex = weekIndexForDate(options.seasonStartDate, today);
  const meso = options.mesocycles.find(
    (m) => weekIndex >= m.startWeekIndex && weekIndex <= m.endWeekIndex
  );
  if (!meso) return null;
  const start = weekStartDateForIndex(options.seasonStartDate, meso.startWeekIndex);
  const endMonday = weekStartDateForIndex(options.seasonStartDate, meso.endWeekIndex);
  const end = addDays(endMonday, 6);
  return {
    name: meso.name,
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
  };
}

export function defaultDashboardPreset(): DashboardRangePreset {
  return "last_3_months";
}

/** Monday of the range start through Monday of the range end (inclusive weeks). */
export function weekStartsTouchingRange(from: string, to: string): string[] {
  const fromWeek = mondayWeekStartKey(from);
  const toWeek = mondayWeekStartKey(to);
  const keys: string[] = [];
  let cur = fromWeek;
  while (cur <= toWeek) {
    keys.push(cur);
    cur = addDaysKey(cur, 7);
  }
  return keys;
}

export function parseDashboardDateParam(value: string | null): string | null {
  if (!value || !DATE_KEY.test(value)) return null;
  // Validate via parse to catch nonsense.
  try {
    parseDateKey(value);
    return value;
  } catch {
    return null;
  }
}
