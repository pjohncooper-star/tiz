import type { PhaseFocus, PhaseKind } from "@prisma/client";

export type ZoneSplitPercents = {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
};

export type TriPlanDiscipline = "SWIM" | "BIKE" | "RUN";

export type DisciplineZoneSplit = {
  mode: "preset" | "custom";
  /** Legacy enum id; same string as catalog id for seeded focuses. */
  focus?: PhaseFocus;
  focusId?: string;
  percents?: ZoneSplitPercents;
};

export type PhaseZoneSplits = Record<TriPlanDiscipline, DisciplineZoneSplit>;

export type PhaseKindZoneDefaults = Record<PhaseKind, PhaseZoneSplits>;

export const TRI_PLAN_DISCIPLINES: TriPlanDiscipline[] = ["SWIM", "BIKE", "RUN"];

export const PHASE_KINDS: PhaseKind[] = ["BASE", "BUILD", "RACE_PREP", "TAPER"];
