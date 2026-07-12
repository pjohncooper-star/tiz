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

/**
 * Simple season planner: unified /plan season editor (phases, ramps, TiZ, recovery).
 * Enable with FEATURE_SIMPLE_SEASON_PLANNER=true in .env
 */
export function isSimpleSeasonPlannerEnabled(): boolean {
  return envFlag("FEATURE_SIMPLE_SEASON_PLANNER");
}

export function isSessionPlanningEnabled(): boolean {
  return isPlanBuilderEnabled() || isPlanningCalendarEnabled();
}
