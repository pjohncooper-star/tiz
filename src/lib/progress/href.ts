import { addDaysToDateKey, mondayWeekStartKey } from "@/lib/dates";

export type ProgressView = "week" | "season";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseProgressParams(
  params: { view?: string; week?: string },
  todayKey: string
): { view: ProgressView; weekStart: string } {
  const view: ProgressView = params.view === "season" ? "season" : "week";
  const weekStart =
    params.week && isRealDateKey(params.week)
      ? mondayWeekStartKey(params.week)
      : mondayWeekStartKey(todayKey);
  return { view, weekStart };
}

export function progressHref(options: { view: ProgressView; weekStart?: string }): string {
  if (options.view === "season") return "/progress?view=season";
  return options.weekStart
    ? `/progress?view=week&week=${options.weekStart}`
    : "/progress?view=week";
}

export function shiftWeekStart(weekStart: string, weeks: number): string {
  return addDaysToDateKey(weekStart, weeks * 7);
}
