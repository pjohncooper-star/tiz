/** Leaf module — no planner imports (avoids circular deps with phase-span-utils). */

export type SimpleLongSessionDefaults = {
  longRideStartMin: number;
  longRidePeakMin: number;
  longRunStartMin: number;
  longRunPeakMin: number;
};

export const DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS: SimpleLongSessionDefaults = {
  longRideStartMin: 60,
  longRidePeakMin: 180,
  longRunStartMin: 30,
  longRunPeakMin: 90,
};
