import { format, parseISO } from "date-fns";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { normalizeWeekStart } from "@/lib/dates";

function activityReturnPathname(path: string): string {
  return path.split("?")[0] ?? path;
}

function isAllowedActivityReturnPath(path: string): boolean {
  const pathname = activityReturnPathname(path);
  return (
    pathname === "/dashboard" ||
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/")
  );
}

/** Link target for returning from activity detail to the calendar week containing a workout. */
export function calendarWeekReturnHref(weekStart: string): string {
  return `/calendar?week=${normalizeWeekStart(weekStart)}`;
}

export function activityReturnHrefFromStartTime(startTime: string): string {
  const dateKey = format(parseISO(startTime), "yyyy-MM-dd");
  return calendarWeekReturnHref(dateKey);
}

/** Where activity detail back links should go. */
export function resolveActivityReturnHref(returnTo?: string | null): string {
  const calendar = isPlanningCalendarEnabled();

  if (returnTo && isAllowedActivityReturnPath(returnTo)) {
    const pathname = activityReturnPathname(returnTo);
    if (pathname.startsWith("/calendar") && calendar) return returnTo;
    if (pathname === "/dashboard") return "/dashboard";
  }

  if (calendar) return "/calendar";
  return "/dashboard";
}

export function activityReturnLabel(returnHref: string): string {
  if (activityReturnPathname(returnHref).startsWith("/calendar")) return "calendar";
  return "dashboard";
}
