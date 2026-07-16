import type { PhaseFocus, PhaseKind } from "@prisma/client";

export type ZoneSplitPercents = {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
};

export type TriPlanDiscipline = "SWIM" | "BIKE" | "RUN";

export type DisciplineZoneSplitCustomStyle = "manual" | "focus_ramp";

export type DisciplineZoneSplit = {
  mode: "preset" | "custom";
  /** When mode is custom: manual sliders vs ramp between catalog focuses. */
  customStyle?: DisciplineZoneSplitCustomStyle;
  /** Legacy enum id; same string as catalog id for seeded focuses. */
  focus?: PhaseFocus;
  focusId?: string;
  /** Catalog focus at ramp start (custom focus_ramp). */
  startFocusId?: string;
  /** Catalog focus at ramp end (custom focus_ramp). */
  endFocusId?: string;
  /** Ramp end (last week of phase). Legacy `percents` is an alias. */
  percents?: ZoneSplitPercents;
  endPercents?: ZoneSplitPercents;
  /** Ramp start (first week of phase). If omitted, chain from prior phase exit. */
  startPercents?: ZoneSplitPercents;
};

export type PhaseZoneSplits = Record<TriPlanDiscipline, DisciplineZoneSplit>;

export type PhaseKindZoneDefaults = Record<PhaseKind, PhaseZoneSplits>;

export const TRI_PLAN_DISCIPLINES: TriPlanDiscipline[] = ["SWIM", "BIKE", "RUN"];

export const PHASE_KINDS: PhaseKind[] = ["BASE", "BUILD", "RACE_PREP", "TAPER"];
