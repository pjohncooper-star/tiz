import { isPlanBuilderEnabled, isPlanningCalendarEnabled } from "@/lib/features";

function isAllowedReturnPath(path: string): boolean {
  return (
    path === "/calendar" ||
    path.startsWith("/calendar/") ||
    path === "/plan" ||
    path.startsWith("/plan/")
  );
}

/** Where session editor save/back/delete should return. */
export function resolveSessionReturnHref(returnTo?: string | null): string {
  const calendar = isPlanningCalendarEnabled();
  const planBuilder = isPlanBuilderEnabled();

  if (returnTo && isAllowedReturnPath(returnTo)) {
    if (returnTo.startsWith("/calendar") && calendar) return returnTo;
    if (returnTo.startsWith("/plan") && planBuilder) return returnTo;
  }

  if (planBuilder) return "/plan";
  if (calendar) return "/calendar";
  return "/dashboard";
}

export function sessionReturnLabel(returnHref: string): string {
  if (returnHref.startsWith("/calendar")) return "calendar";
  if (returnHref.startsWith("/plan")) return "plan";
  return "dashboard";
}
