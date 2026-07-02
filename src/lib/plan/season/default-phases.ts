import type { PhaseKind } from "@prisma/client";
import { mesocycleRoman } from "./mesocycle-draft";
import type { SeasonPhaseInput } from "./types";

export const SUGGESTED_BASE_WEEKS = 8;
export const SUGGESTED_BUILD_WEEKS = 8;
export const SUGGESTED_RACE_PREP_WEEKS = 8;
export const SUGGESTED_TAPER_WEEKS = 2;
export const FIXED_TEMPLATE_WEEKS =
  SUGGESTED_BASE_WEEKS +
  SUGGESTED_BUILD_WEEKS +
  SUGGESTED_RACE_PREP_WEEKS +
  SUGGESTED_TAPER_WEEKS;
export const FIXED_TEMPLATE_THRESHOLD = 26;

const PHASE_COLORS: Record<PhaseKind, string> = {
  BASE: "#38bdf8",
  BUILD: "#6366f1",
  RACE_PREP: "#f59e0b",
  TAPER: "#22c55e",
};

const DEFAULT_FOCUS: Record<PhaseKind, SeasonPhaseInput["phaseFocus"]> = {
  BASE: "AEROBIC_BASE",
  BUILD: "THRESHOLD",
  RACE_PREP: "RACE_SPECIFICITY",
  TAPER: "FRESHNESS",
};

const PHASE_DISPLAY_NAMES: Record<PhaseKind, string> = {
  BASE: "Base",
  BUILD: "Build",
  RACE_PREP: "Race prep",
  TAPER: "Taper",
};

type PhaseBlock = {
  name: string;
  weekCount: number;
  phaseKind: PhaseKind;
};

/** Roman ordinals for repeated base blocks: Base, Base II, Base III, … */
export function ordinalBaseName(index: number): string {
  if (index === 0) return "Base";
  return `Base ${mesocycleRoman(index)}`;
}

function blocksToPhaseInputs(blocks: PhaseBlock[]): SeasonPhaseInput[] {
  let sortOrder = 0;
  return blocks
    .filter((b) => b.weekCount > 0)
    .map((b) => ({
      name: b.name,
      sortOrder: sortOrder++,
      weekCount: b.weekCount,
      phaseKind: b.phaseKind,
      color: PHASE_COLORS[b.phaseKind],
      focusMode: "PHASE" as const,
      phaseFocus: DEFAULT_FOCUS[b.phaseKind],
      swimSessionsPerWeek: 3,
      bikeSessionsPerWeek: 4,
      runSessionsPerWeek: 3,
    }));
}

/** Percentage split for seasons shorter than 26 weeks (legacy behavior). */
export function percentagePhasesForWeeks(totalWeeks: number): SeasonPhaseInput[] {
  const taper = Math.max(1, Math.round(totalWeeks * 0.1));
  const racePrep = Math.max(1, Math.round(totalWeeks * 0.15));
  const build = Math.max(2, Math.round(totalWeeks * 0.35));
  let base = totalWeeks - build - racePrep - taper;
  if (base < 2) {
    base = Math.max(1, totalWeeks - taper - racePrep - 1);
  }

  const blocks: PhaseBlock[] = [
    { name: "Base", weekCount: base, phaseKind: "BASE" },
    { name: "Build", weekCount: build, phaseKind: "BUILD" },
    { name: "Race prep", weekCount: racePrep, phaseKind: "RACE_PREP" },
    { name: "Taper", weekCount: taper, phaseKind: "TAPER" },
  ];

  return blocksToPhaseInputs(blocks);
}

/** Fixed 8+8+8+2 template with prepended base blocks when totalWeeks > 26. */
export function fixedPhasesForWeeks(totalWeeks: number): SeasonPhaseInput[] {
  const blocks: PhaseBlock[] = [];
  let extra = totalWeeks - FIXED_TEMPLATE_WEEKS;
  let baseOrdinal = 0;

  while (extra >= SUGGESTED_BASE_WEEKS) {
    blocks.push({
      name: ordinalBaseName(baseOrdinal++),
      weekCount: SUGGESTED_BASE_WEEKS,
      phaseKind: "BASE",
    });
    extra -= SUGGESTED_BASE_WEEKS;
  }
  if (extra > 0) {
    blocks.push({
      name: ordinalBaseName(baseOrdinal++),
      weekCount: extra,
      phaseKind: "BASE",
    });
  }

  blocks.push(
    {
      name: ordinalBaseName(baseOrdinal++),
      weekCount: SUGGESTED_BASE_WEEKS,
      phaseKind: "BASE",
    },
    {
      name: PHASE_DISPLAY_NAMES.BUILD,
      weekCount: SUGGESTED_BUILD_WEEKS,
      phaseKind: "BUILD",
    },
    {
      name: PHASE_DISPLAY_NAMES.RACE_PREP,
      weekCount: SUGGESTED_RACE_PREP_WEEKS,
      phaseKind: "RACE_PREP",
    },
    {
      name: PHASE_DISPLAY_NAMES.TAPER,
      weekCount: SUGGESTED_TAPER_WEEKS,
      phaseKind: "TAPER",
    }
  );

  return blocksToPhaseInputs(blocks);
}

export function suggestPhasesForWeeks(totalWeeks: number): SeasonPhaseInput[] {
  if (totalWeeks < FIXED_TEMPLATE_THRESHOLD) {
    return percentagePhasesForWeeks(totalWeeks);
  }
  return fixedPhasesForWeeks(totalWeeks);
}

/** @deprecated Use suggestPhasesForWeeks */
export function defaultPhasesForWeeks(totalWeeks: number): SeasonPhaseInput[] {
  return suggestPhasesForWeeks(totalWeeks);
}

export function defaultPhaseForKind(
  kind: PhaseKind,
  weekCount = 4,
  sortOrder = 0,
  name?: string
): SeasonPhaseInput {
  return {
    name: name ?? PHASE_DISPLAY_NAMES[kind],
    sortOrder,
    weekCount,
    phaseKind: kind,
    color: PHASE_COLORS[kind],
    focusMode: "PHASE",
    phaseFocus: DEFAULT_FOCUS[kind],
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
  };
}

export function phaseWeekTotal(phases: Pick<SeasonPhaseInput, "weekCount">[]): number {
  return phases.reduce((sum, p) => sum + p.weekCount, 0);
}
