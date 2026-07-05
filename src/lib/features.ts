/**
 * Plan builder: anchor workouts on /plan (interim until season planner rebuild).
 * Enable with FEATURE_PLAN_BUILDER=true in .env
 */
export function isPlanBuilderEnabled(): boolean {
  return process.env.FEATURE_PLAN_BUILDER === "true";
}

/**
 * Volume-first single-page season planner (replaces wizard when enabled).
 * Enable with FEATURE_SIMPLE_SEASON_PLANNER=true in .env
 */
export function isSimpleSeasonPlannerEnabled(): boolean {
  return process.env.FEATURE_SIMPLE_SEASON_PLANNER === "true";
}

/**
 * Legacy season wizard, multi-section settings, zone dashboard.
 * Enable with FEATURE_ADVANCED_SEASON_PLANNER=true in .env
 */
export function isAdvancedSeasonPlannerEnabled(): boolean {
  return process.env.FEATURE_ADVANCED_SEASON_PLANNER === "true";
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
