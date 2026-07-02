import type { PhaseKind } from "@prisma/client";
import { mesocycleForWeekIndex } from "./phase-split";
import type { ComputedMesocycle } from "./types";

export const LONG_SESSION_MEDIUM_FACTOR = 0.6;

export type LongWeekPreset = "default" | "every_week" | "every_other";

export type DefaultLongWeekFlagsInput = {
  totalWeeks: number;
  phaseKindsByWeek: PhaseKind[];
  mesocycles: ComputedMesocycle[];
  deLoadFlags: boolean[];
  preset?: LongWeekPreset;
};

export function parseLongWeekFlags(value: unknown): boolean[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((flag) => typeof flag === "boolean")) return null;
  return value;
}

export function mergeLongWeekFlags(
  defaults: boolean[],
  stored: boolean[] | null | undefined
): boolean[] {
  if (stored && stored.length === defaults.length) {
    return stored;
  }
  return defaults;
}

export function applyLongSessionTier(fullMinutes: number, isFull: boolean): number {
  if (isFull) return fullMinutes;
  return Math.round(fullMinutes * LONG_SESSION_MEDIUM_FACTOR);
}

export function defaultLongWeekFlagAtWeek(
  weekIndex: number,
  input: DefaultLongWeekFlagsInput
): boolean {
  const {
    phaseKindsByWeek,
    mesocycles,
    deLoadFlags,
    preset = "default",
  } = input;
  const kind = phaseKindsByWeek[weekIndex] ?? "BUILD";

  if (deLoadFlags[weekIndex]) return false;
  if (kind === "TAPER") return false;

  if (preset === "every_week") {
    return true;
  }

  if (preset === "every_other") {
    const meso = mesocycleForWeekIndex(mesocycles, weekIndex);
    if (!meso) return true;
    const relativeWeek = weekIndex - meso.startWeekIndex;
    return relativeWeek % 2 === 0;
  }

  if (kind === "BUILD" || kind === "RACE_PREP") {
    return true;
  }

  if (kind === "BASE") {
    const meso = mesocycleForWeekIndex(mesocycles, weekIndex);
    if (!meso) return true;
    const relativeWeek = weekIndex - meso.startWeekIndex;
    return relativeWeek % 2 === 0;
  }

  return true;
}

export function defaultLongWeekFlags(input: DefaultLongWeekFlagsInput): boolean[] {
  return Array.from({ length: input.totalWeeks }, (_, weekIndex) =>
    defaultLongWeekFlagAtWeek(weekIndex, input)
  );
}

export function longWeekBarHeightPercent(isFull: boolean): number {
  return isFull
    ? 100
    : Math.min(100, Math.max(30, Math.round(LONG_SESSION_MEDIUM_FACTOR * 100)));
}
