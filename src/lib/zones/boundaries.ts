import type { Discipline, SignalType } from "@prisma/client";

export const DEFAULT_ZONE_COUNT = 5;

/**
 * Zone cutoffs as % of threshold intensity (higher = harder).
 * For PACE this is % of threshold *speed* (stored form). Length is typically zoneCount - 1.
 */
export type ZoneBoundaryKey = `${Discipline}:${SignalType}`;

/** Convert % of threshold pace (higher = slower) ↔ % of threshold speed (higher = faster). */
export function pacePctToSpeedPct(pacePct: number): number {
  if (!(pacePct > 0)) throw new Error("pacePct must be positive");
  return 10000 / pacePct;
}

export function speedPctToPacePct(speedPct: number): number {
  if (!(speedPct > 0)) throw new Error("speedPct must be positive");
  return 10000 / speedPct;
}

export function roundPct(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Build ascending speed-% cutoffs from descending pace-% zone tops (Z1..Z{n-1}). */
export function speedBoundariesFromPaceTops(paceTops: number[]): number[] {
  return paceTops.map((p) => roundPct(pacePctToSpeedPct(p)));
}

/**
 * Defaults keyed by discipline + signal.
 * Pace values are stored as speed %; derived from the coaching tables:
 * Run pace tops 129 / 114 / 106 / 100; swim CSS pace tops 107 / 102 / 98 / 94.
 */
export const DEFAULT_ZONE_BOUNDARIES_BY_KEY: Record<ZoneBoundaryKey, number[]> = {
  "BIKE:POWER": [55, 75, 90, 105],
  "BIKE:HEART_RATE": [68, 83, 94, 100, 106],
  "BIKE:PACE": [78, 88, 94, 100],
  "RUN:POWER": [55, 75, 90, 105],
  "RUN:HEART_RATE": [68, 83, 94, 100, 106],
  // 100/1.29, 100/1.14, 100/1.06, 100
  "RUN:PACE": speedBoundariesFromPaceTops([129, 114, 106, 100]),
  "SWIM:POWER": [55, 75, 90, 105],
  "SWIM:HEART_RATE": [68, 83, 94, 100, 106],
  // 100/1.07, 100/1.02, 100/0.98, 100/0.94
  "SWIM:PACE": speedBoundariesFromPaceTops([107, 102, 98, 94]),
  "STRENGTH:POWER": [55, 75, 90, 105],
  "STRENGTH:HEART_RATE": [68, 83, 94, 100, 106],
  "STRENGTH:PACE": speedBoundariesFromPaceTops([129, 114, 106, 100]),
};

export function zoneBoundaryKey(
  discipline: Discipline,
  signalType: SignalType
): ZoneBoundaryKey {
  return `${discipline}:${signalType}`;
}

export function zoneBoundariesFor(
  discipline: Discipline,
  signalType: SignalType
): number[] {
  const key = zoneBoundaryKey(discipline, signalType);
  const boundaries = DEFAULT_ZONE_BOUNDARIES_BY_KEY[key];
  if (!boundaries) {
    throw new Error(`No default zone boundaries for ${key}`);
  }
  return [...boundaries];
}

/** @deprecated Prefer zoneBoundariesFor(discipline, signalType). */
export function zoneBoundariesForSignal(signalType: SignalType): number[] {
  if (signalType === "POWER") return zoneBoundariesFor("BIKE", "POWER");
  if (signalType === "PACE") return zoneBoundariesFor("RUN", "PACE");
  return zoneBoundariesFor("BIKE", "HEART_RATE");
}

export function validateZoneBoundaries(
  boundaries: number[],
  zoneCount: number = DEFAULT_ZONE_COUNT
): string | null {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return "Zone boundaries are required";
  }
  // Allow zoneCount - 1 (preferred) or zoneCount (legacy profiles with a soft Z5 cap).
  if (
    boundaries.length !== zoneCount - 1 &&
    boundaries.length !== zoneCount
  ) {
    return `Expected ${zoneCount - 1} or ${zoneCount} zone boundaries`;
  }
  for (const b of boundaries) {
    if (typeof b !== "number" || !Number.isFinite(b) || b <= 0) {
      return "Zone boundaries must be positive numbers";
    }
  }
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) {
      return "Zone boundaries must be strictly increasing";
    }
  }
  return null;
}

/**
 * UI values for editing cutoffs.
 * Power/HR: same as stored %. Pace: % of threshold pace (higher = slower), descending.
 */
export function boundariesToEditorValues(
  signalType: SignalType,
  storedSpeedPct: number[]
): number[] {
  if (signalType !== "PACE") return storedSpeedPct.map((v) => roundPct(v));
  // Pace editor shows zone tops as pace % (Z1 slowest first): descending
  return storedSpeedPct.map((v) => roundPct(speedPctToPacePct(v)));
}

export function editorValuesToBoundaries(
  signalType: SignalType,
  editorValues: number[]
): number[] {
  if (signalType !== "PACE") return editorValues.map((v) => roundPct(v));
  // Editor lists pace % tops Z1→Z4 (descending / slowing). Convert to ascending speed %.
  return editorValues.map((v) => roundPct(pacePctToSpeedPct(v)));
}

export function validateEditorValues(
  signalType: SignalType,
  editorValues: number[],
  zoneCount: number = DEFAULT_ZONE_COUNT
): string | null {
  if (editorValues.length !== zoneCount - 1 && editorValues.length !== zoneCount) {
    return `Expected ${zoneCount - 1} or ${zoneCount} cutoffs`;
  }
  for (const v of editorValues) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return "Cutoffs must be positive numbers";
    }
  }
  if (signalType === "PACE") {
    // Pace % tops should be strictly decreasing (Z1 slowest → faster)
    for (let i = 1; i < editorValues.length; i++) {
      if (editorValues[i] >= editorValues[i - 1]) {
        return "Pace zone cutoffs must decrease (slower → faster)";
      }
    }
    return null;
  }
  for (let i = 1; i < editorValues.length; i++) {
    if (editorValues[i] <= editorValues[i - 1]) {
      return "Zone cutoffs must be strictly increasing";
    }
  }
  return null;
}
