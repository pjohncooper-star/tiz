import type { SeasonPhaseInput } from "./types";
import { splitPhaseIntoMesocycles } from "./phase-split";

export type MesocycleDraft = {
  id?: string;
  name: string;
  weekCount: number;
  swimSplitPercent?: number | null;
  bikeSplitPercent?: number | null;
  runSplitPercent?: number | null;
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

export function mesocycleRoman(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

export function defaultMesocycleDrafts(
  phaseName: string,
  weekCount: number,
  blockLength: number
): MesocycleDraft[] {
  if (weekCount <= 0) return [];

  const phase: SeasonPhaseInput = {
    name: phaseName,
    sortOrder: 0,
    weekCount,
    phaseKind: "BASE",
    focusMode: "PHASE",
    phaseFocus: "AEROBIC_BASE",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
  };

  return splitPhaseIntoMesocycles(phase, 0, 0, blockLength).map((meso) => ({
    name: meso.name,
    weekCount: meso.endWeekIndex - meso.startWeekIndex + 1,
  }));
}

export function mesocyclesFromSerialized(
  mesocycles:
    | {
        id: string;
        name: string;
        index: number;
        startWeekIndex: number;
        endWeekIndex: number;
      }[]
    | undefined,
  phaseName: string,
  weekCount: number,
  blockLength: number
): MesocycleDraft[] {
  if (!mesocycles?.length) {
    return defaultMesocycleDrafts(phaseName, weekCount, blockLength);
  }
  return [...mesocycles]
    .sort((a, b) => a.index - b.index)
    .map((m) => ({
      id: m.id,
      name: m.name,
      weekCount: m.endWeekIndex - m.startWeekIndex + 1,
      swimSplitPercent: m.swimSplitPercent,
      bikeSplitPercent: m.bikeSplitPercent,
      runSplitPercent: m.runSplitPercent,
    }));
}

export function mesocycleWeekTotal(mesocycles: MesocycleDraft[] | undefined): number {
  return mesocycles?.reduce((sum, m) => sum + m.weekCount, 0) ?? 0;
}

export function phaseMesocyclesValid(phase: {
  weekCount: number;
  mesocycles?: MesocycleDraft[];
}): boolean {
  if (!phase.mesocycles?.length) return false;
  return mesocycleWeekTotal(phase.mesocycles) === phase.weekCount;
}

export function allPhaseMesocyclesValid(
  phases: { weekCount: number; mesocycles?: MesocycleDraft[] }[]
): boolean {
  return phases.every(phaseMesocyclesValid);
}

export function nextMesocycleName(phaseName: string, mesocycles: MesocycleDraft[]): string {
  return `${phaseName} ${mesocycleRoman(mesocycles.length)}`;
}

export function draftsToPhaseMesocycleInput(
  mesocycles: MesocycleDraft[]
): { name: string; weekCount: number }[] {
  return mesocycles.map((m) => ({ name: m.name, weekCount: m.weekCount }));
}
