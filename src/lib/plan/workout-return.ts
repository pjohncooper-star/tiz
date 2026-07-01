import { format, parseISO } from "date-fns";
import { normalizeWeekStart } from "@/lib/dates";
import { isPlanBuilderEnabled, isPlanningCalendarEnabled } from "@/lib/features";

function returnPathname(path: string): string {
  return path.split("?")[0] ?? path;
}

function isAllowedWorkoutReturnPath(path: string): boolean {
  const pathname = returnPathname(path);
  return (
    pathname === "/dashboard" ||
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/") ||
    pathname === "/plan" ||
    pathname.startsWith("/plan/")
  );
}

export function calendarWeekReturnHref(weekStart: string): string {
  return `/calendar?week=${normalizeWeekStart(weekStart)}`;
}

export function workoutReturnHrefFromStartTime(startTime: string): string {
  const dateKey = format(parseISO(startTime), "yyyy-MM-dd");
  return calendarWeekReturnHref(dateKey);
}

export function resolveWorkoutReturnHref(returnTo?: string | null): string {
  const calendar = isPlanningCalendarEnabled();
  const planBuilder = isPlanBuilderEnabled();

  if (returnTo && isAllowedWorkoutReturnPath(returnTo)) {
    const pathname = returnPathname(returnTo);
    if (pathname.startsWith("/calendar") && calendar) return returnTo;
    if (pathname.startsWith("/plan") && planBuilder) return returnTo;
    if (pathname === "/dashboard") return "/dashboard";
  }

  if (calendar) return "/calendar";
  if (planBuilder) return "/plan";
  return "/dashboard";
}

export function workoutReturnLabel(returnHref: string): string {
  const pathname = returnPathname(returnHref);
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/plan")) return "plan";
  return "dashboard";
}
