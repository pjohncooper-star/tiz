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
 * Pace values are stored as % of threshold *speed* (higher = harder), then
 * converted to pace for display. Coaching model:
 * Z1 <75%, Z2 75–90%, Z3 (tempo) 90–99%, Z4 (threshold) 99–105%, Z5 ≥105%.
 */
export const DEFAULT_ZONE_BOUNDARIES_BY_KEY: Record<ZoneBoundaryKey, number[]> = {
  "BIKE:POWER": [55, 75, 90, 105],
  "BIKE:HEART_RATE": [68, 83, 94, 100, 106],
  "BIKE:PACE": [75, 90, 99, 105],
  "RUN:POWER": [55, 75, 90, 105],
  "RUN:HEART_RATE": [68, 83, 94, 100, 106],
  "RUN:PACE": [75, 90, 99, 105],
  "SWIM:POWER": [55, 75, 90, 105],
  "SWIM:HEART_RATE": [68, 83, 94, 100, 106],
  "SWIM:PACE": [75, 90, 99, 105],
  "STRENGTH:POWER": [55, 75, 90, 105],
  "STRENGTH:HEART_RATE": [68, 83, 94, 100, 106],
  "STRENGTH:PACE": [75, 90, 99, 105],
};

/**
 * Prior default speed-% arrays (Z4/Z5 cut at ~100% so threshold scored as Z5).
 * Soft-upgrade when loading stored profiles that still match these.
 */
const LEGACY_PACE_SPEED_DEFAULTS: Array<{ from: number[]; to: number[] }> = [
  // Old RUN/STRENGTH via speedBoundariesFromPaceTops([129, 114, 106, 100])
  { from: [77.5, 87.7, 94.3, 100], to: [75, 90, 99, 105] },
  // Old BIKE:PACE hardcoded
  { from: [78, 88, 94, 100], to: [75, 90, 99, 105] },
  // Old SWIM via speedBoundariesFromPaceTops([107, 102, 98, 94])
  { from: [93.5, 98, 102, 106.4], to: [75, 90, 99, 105] },
];

export function coalesceLegacyPaceBoundaries(boundaries: number[]): number[] {
  for (const { from, to } of LEGACY_PACE_SPEED_DEFAULTS) {
    if (
      boundaries.length === from.length &&
      boundaries.every((b, i) => Math.abs(b - from[i]!) < 0.06)
    ) {
      return [...to];
    }
  }
  return boundaries;
}

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
 * Power/HR/Pace: same as stored % of threshold intensity (for pace: % of threshold speed).
 */
export function boundariesToEditorValues(
  signalType: SignalType,
  storedSpeedPct: number[]
): number[] {
  void signalType;
  return storedSpeedPct.map((v) => roundPct(v));
}

export function editorValuesToBoundaries(
  signalType: SignalType,
  editorValues: number[]
): number[] {
  void signalType;
  return editorValues.map((v) => roundPct(v));
}

export function validateEditorValues(
  signalType: SignalType,
  editorValues: number[],
  zoneCount: number = DEFAULT_ZONE_COUNT
): string | null {
  void signalType;
  if (editorValues.length !== zoneCount - 1 && editorValues.length !== zoneCount) {
    return `Expected ${zoneCount - 1} or ${zoneCount} cutoffs`;
  }
  for (const v of editorValues) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return "Cutoffs must be positive numbers";
    }
  }
  for (let i = 1; i < editorValues.length; i++) {
    if (editorValues[i] <= editorValues[i - 1]) {
      return "Zone cutoffs must be strictly increasing";
    }
  }
  return null;
}
