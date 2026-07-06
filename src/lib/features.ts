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
 * Volume-first single-page season planner (replaces wizard when enabled).
 * Enable with FEATURE_SIMPLE_SEASON_PLANNER=true in .env
 */
export function isSimpleSeasonPlannerEnabled(): boolean {
  return envFlag("FEATURE_SIMPLE_SEASON_PLANNER");
}

/**
 * Legacy season wizard, multi-section settings, zone dashboard.
 * Enable with FEATURE_ADVANCED_SEASON_PLANNER=true in .env
 */
export function isAdvancedSeasonPlannerEnabled(): boolean {
  return envFlag("FEATURE_ADVANCED_SEASON_PLANNER");
}

/**
 * When simple planner is on and advanced is off, use the new experience only.
 */
export function useSimpleSeasonPlannerOnly(): boolean {
  return isSimpleSeasonPlannerEnabled() && !isAdvancedSeasonPlannerEnabled();
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
