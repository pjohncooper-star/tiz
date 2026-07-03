import type { PhaseKind } from "@prisma/client";
import { DEFAULT_DISCIPLINE_SPLIT } from "./constants";
import type { DisciplineHours } from "./discipline-split";
import { roundHours } from "./volume-curve";
import { mesocycleForWeekIndex } from "./phase-split";
import type {
  ComputedMesocycle,
  PhaseMesocycleInput,
  SeasonPhaseInput,
} from "./types";

export type DisciplineSplit = { swim: number; bike: number; run: number };

export type SeasonSplitInput = {
  swimSplitPercent?: number | null;
  bikeSplitPercent?: number | null;
  runSplitPercent?: number | null;
};

export type SplitSourceInput = {
  swimSplitPercent?: number | null;
  bikeSplitPercent?: number | null;
  runSplitPercent?: number | null;
};

export function splitSourceHasCustomSplit(source: SplitSourceInput | null | undefined): boolean {
  if (!source) return false;
  return (
    source.swimSplitPercent != null ||
    source.bikeSplitPercent != null ||
    source.runSplitPercent != null
  );
}

export function seasonHasCustomSplit(season: SeasonSplitInput): boolean {
  return splitSourceHasCustomSplit(season);
}

export function mesocycleHasCustomSplit(meso: SplitSourceInput): boolean {
  return splitSourceHasCustomSplit(meso);
}

export function planUsesCustomSplits(
  season: SeasonSplitInput,
  phases: SeasonPhaseInput[]
): boolean {
  if (seasonHasCustomSplit(season)) return true;
  return phases.some((phase) =>
    phase.mesocycles?.some((meso) => mesocycleHasCustomSplit(meso))
  );
}

export function normalizeSplitPercentages(
  swim: number | null | undefined,
  bike: number | null | undefined,
  run: number | null | undefined
): DisciplineSplit | null {
  if (swim == null && bike == null && run == null) {
    return null;
  }

  const swimPct = swim ?? 0;
  const bikePct = bike ?? 0;
  const runPct = run != null ? run : Math.max(0, 100 - swimPct - bikePct);
  return { swim: swimPct, bike: bikePct, run: runPct };
}

export function splitFromSource(source: SplitSourceInput): DisciplineSplit | null {
  return normalizeSplitPercentages(
    source.swimSplitPercent,
    source.bikeSplitPercent,
    source.runSplitPercent
  );
}

export function phaseKindDefaultSplit(phaseKind: PhaseKind): DisciplineSplit {
  const split = DEFAULT_DISCIPLINE_SPLIT[phaseKind];
  return { swim: split.swim, bike: split.bike, run: split.run };
}

function mesocycleInputForComputed(
  phases: SeasonPhaseInput[],
  meso: ComputedMesocycle
): PhaseMesocycleInput | undefined {
  const phase = [...phases].sort((a, b) => a.sortOrder - b.sortOrder)[meso.phaseIndex];
  return phase?.mesocycles?.[meso.index];
}

export function resolveSplitForWeek(
  weekIndex: number,
  phaseKind: PhaseKind,
  mesocycles: ComputedMesocycle[],
  phases: SeasonPhaseInput[],
  seasonSplit: SeasonSplitInput
): DisciplineSplit {
  const meso = mesocycleForWeekIndex(mesocycles, weekIndex);
  if (meso) {
    const mesoInput = mesocycleInputForComputed(phases, meso);
    const mesoSplit = splitFromSource(mesoInput ?? meso);
    if (mesoSplit) return mesoSplit;
  }

  const season = splitFromSource(seasonSplit);
  if (season) return season;

  return phaseKindDefaultSplit(phaseKind);
}

export function splitHoursByResolvedSplit(
  totalHours: number,
  split: DisciplineSplit
): DisciplineHours {
  const swimHours = roundHours((totalHours * split.swim) / 100);
  const bikeHours = roundHours((totalHours * split.bike) / 100);
  const runHours = roundHours(totalHours - swimHours - bikeHours);
  return { swimHours, bikeHours, runHours };
}
