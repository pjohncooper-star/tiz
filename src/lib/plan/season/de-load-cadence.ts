import type { PhaseKind } from "@prisma/client";
import type { ComputedMesocycle } from "./types";

export type DeLoadCadenceInput = {
  totalWeeks: number;
  everyNWeeks: number;
  /** Week indices where taper applies — de-load markers suppressed. */
  taperWeekIndices?: number[];
};

/** @deprecated Use markDeLoadWeeksPerMesocycle for season plans with mesocycles. */
export function markDeLoadWeeks(input: DeLoadCadenceInput): boolean[] {
  const { totalWeeks, everyNWeeks, taperWeekIndices = [] } = input;
  const taperSet = new Set(taperWeekIndices);
  const cadence = Math.max(1, everyNWeeks);
  const flags = Array.from({ length: totalWeeks }, () => false);

  for (let i = cadence; i < totalWeeks; i += cadence) {
    if (taperSet.has(i)) continue;
    flags[i] = true;
  }

  return flags;
}

export type MarkDeLoadPerMesocycleInput = {
  mesocycles: ComputedMesocycle[];
  totalWeeks: number;
  everyNWeeks: number;
  taperWeekIndices?: number[];
};

/** Mark de-load weeks every N weeks, restarting at each mesocycle boundary. */
export function markDeLoadWeeksPerMesocycle(input: MarkDeLoadPerMesocycleInput): boolean[] {
  const { mesocycles, totalWeeks, everyNWeeks, taperWeekIndices = [] } = input;
  const taperSet = new Set(taperWeekIndices);
  const cadence = Math.max(1, everyNWeeks);
  const flags = Array.from({ length: totalWeeks }, () => false);

  for (const meso of mesocycles) {
    const mesoLength = meso.endWeekIndex - meso.startWeekIndex + 1;
    for (let rel = cadence; rel < mesoLength; rel += cadence) {
      const weekIndex = meso.startWeekIndex + rel;
      if (weekIndex >= 0 && weekIndex < totalWeeks && !taperSet.has(weekIndex)) {
        flags[weekIndex] = true;
      }
    }
  }

  return flags;
}

export function mergeDeLoadFlags(
  defaults: boolean[],
  stored: boolean[] | null | undefined
): boolean[] {
  if (stored && stored.length === defaults.length) {
    return stored;
  }
  return defaults;
}

export function mesocycleLayoutFingerprint(mesocycles: ComputedMesocycle[]): string {
  return mesocycles
    .map((m) => `${m.startWeekIndex}:${m.endWeekIndex}`)
    .join("|");
}

export function parseDeLoadWeekFlags(value: unknown): boolean[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === "boolean")) return null;
  return value;
}

export function taperWeekIndicesFromPhaseKinds(
  phaseKindsByWeek: PhaseKind[],
  totalWeeks: number
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    if (phaseKindsByWeek[i] === "TAPER") {
      indices.push(i);
    }
  }
  return indices;
}

export function countDeLoadWeeks(flags: boolean[]): number {
  return flags.filter(Boolean).length;
}
