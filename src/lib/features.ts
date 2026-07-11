/**
 * Plan builder: anchor workouts on /plan (interim until season planner rebuild).
 * Enable with FEATURE_PLAN_BUILDER=true in .env
 */
function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export function isPlanBuilderEnabled(): boolean {
  return envFlag("FEATURE_PLAN_BUILDER");
}

/**
 * Planning calendar: scrollable week view, weekly template, drag-and-drop.
 * Enable with FEATURE_PLANNING_CALENDAR=true in .env
 */
export function isPlanningCalendarEnabled(): boolean {
  return process.env.FEATURE_PLANNING_CALENDAR === "true";
}

export function isSessionPlanningEnabled(): boolean {
  return isPlanBuilderEnabled() || isPlanningCalendarEnabled();
}
