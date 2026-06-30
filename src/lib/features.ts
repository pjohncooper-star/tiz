/**
 * Plan builder: anchor workouts on /plan (interim until season planner rebuild).
 * Enable with FEATURE_PLAN_BUILDER=true in .env
 */
export function isPlanBuilderEnabled(): boolean {
  return process.env.FEATURE_PLAN_BUILDER === "true";
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
