import type { PhaseKind } from "@prisma/client";
import {
  RACE_PREP_VOLUME_FACTOR,
  TAPER_VOLUME_END_FACTOR,
  TAPER_VOLUME_START_FACTOR,
} from "./constants";
import {
  plateauForWeek,
  resolvePhaseTargets,
  type SeasonVolumeAnchors,
} from "./phase-volume-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

export type VolumeCurveInput = {
  totalWeeks: number;
  phaseKindsByWeek: PhaseKind[];
  phases: SeasonPhaseInput[];
  mesocycles: ComputedMesocycle[];
  startHours: number;
  peakHours: number;
  maxRampPercent: number;
  deLoadFlags: boolean[];
  deLoadVolumePercent: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function taperFactor(weekIndexInTaper: number, taperWeekCount: number): number {
  if (taperWeekCount <= 1) {
    return TAPER_VOLUME_START_FACTOR;
  }
  const t = weekIndexInTaper / (taperWeekCount - 1);
  return lerp(TAPER_VOLUME_START_FACTOR, TAPER_VOLUME_END_FACTOR, t);
}

function seasonVolumeAnchors(input: VolumeCurveInput): SeasonVolumeAnchors {
  return {
    startHours: input.startHours,
    peakHours: input.peakHours,
    longRideStartMin: 0,
    longRidePeakMin: 0,
    longRunStartMin: 0,
    longRunPeakMin: 0,
  };
}

/**
 * Build weekly hours: per-phase mesocycle stepping, taper 70%→45%, then de-load multiplier.
 */
export function computeWeeklyVolumeCurve(input: VolumeCurveInput): number[] {
  const {
    totalWeeks,
    phaseKindsByWeek,
    phases,
    mesocycles,
    peakHours,
    deLoadFlags,
    deLoadVolumePercent,
  } = input;

  const resolved = resolvePhaseTargets(phases, seasonVolumeAnchors(input));
  const hours: number[] = [];
  let taperCounter = 0;
  const taperWeekCount = phaseKindsByWeek.filter((k) => k === "TAPER").length;

  for (let i = 0; i < totalWeeks; i++) {
    const kind = phaseKindsByWeek[i] ?? "BUILD";
    let base: number;

    if (kind === "TAPER") {
      base = peakHours * taperFactor(taperCounter, taperWeekCount);
      taperCounter += 1;
    } else {
      const plateau = plateauForWeek(i, phases, mesocycles, resolved, "volume");
      if (plateau != null) {
        base = plateau;
      } else if (kind === "RACE_PREP") {
        base = peakHours * RACE_PREP_VOLUME_FACTOR;
      } else {
        base = peakHours;
      }
    }

    if (deLoadFlags[i]) {
      base *= deLoadVolumePercent / 100;
    }

    hours.push(roundHours(base));
  }

  return hours;
}

export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

export function peakWeekIndex(hours: number[]): number {
  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i]! > peak) {
      peak = hours[i]!;
      peakIdx = i;
    }
  }
  return peakIdx;
}
