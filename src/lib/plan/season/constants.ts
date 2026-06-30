import type { DeLoadStrategy, PhaseFocus, PhaseKind } from "@prisma/client";

/** Swim / bike / run percent of weekly hours by macro phase kind. */
export const DEFAULT_DISCIPLINE_SPLIT: Record<
  PhaseKind,
  { swim: number; bike: number; run: number }
> = {
  BASE: { swim: 18, bike: 48, run: 34 },
  BUILD: { swim: 15, bike: 52, run: 33 },
  RACE_PREP: { swim: 22, bike: 45, run: 33 },
  TAPER: { swim: 20, bike: 42, run: 38 },
};

/** Z1–Z5 percent of discipline hours for each training focus. */
export const FOCUS_TIZ_PRESETS: Record<
  PhaseFocus,
  { z1: number; z2: number; z3: number; z4: number; z5: number }
> = {
  AEROBIC_BASE: { z1: 75, z2: 20, z3: 4, z4: 0.5, z5: 0.5 },
  THRESHOLD: { z1: 50, z2: 30, z3: 15, z4: 4, z5: 1 },
  VO2_MAX: { z1: 45, z2: 25, z3: 20, z4: 8, z5: 2 },
  RACE_SPECIFICITY: { z1: 55, z2: 25, z3: 12, z4: 6, z5: 2 },
  FRESHNESS: { z1: 80, z2: 15, z3: 4, z4: 0.5, z5: 0.5 },
  STRENGTH_POWER: { z1: 60, z2: 20, z3: 10, z4: 8, z5: 2 },
  MAINTENANCE: { z1: 70, z2: 22, z3: 6, z4: 1, z5: 1 },
};

export const DEFAULT_DE_LOAD_COUNT_SCALE_PERCENT = 50;

export const RACE_PREP_VOLUME_FACTOR = 0.9;
export const TAPER_VOLUME_START_FACTOR = 0.7;
export const TAPER_VOLUME_END_FACTOR = 0.45;

export const DRAFT_LEAD_DAYS = 28;

export const DE_LOAD_INTENSITY_SHIFT: Partial<
  Record<DeLoadStrategy, { z1Boost: number; z4z5Cut: number }>
> = {
  VOLUME_AND_INTENSITY: { z1Boost: 10, z4z5Cut: 50 },
  VOLUME_ONLY: { z1Boost: 0, z4z5Cut: 0 },
  SINGLE_SPORT_FOCUS: { z1Boost: 5, z4z5Cut: 25 },
};
