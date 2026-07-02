import type { PhaseKind } from "@prisma/client";
import {
  RACE_PREP_VOLUME_FACTOR,
  TAPER_VOLUME_END_FACTOR,
  TAPER_VOLUME_START_FACTOR,
} from "./constants";
import {
  mesocycleRampStepIndex,
  mesocycleSteppedValue,
  rampMesocycles,
} from "./mesocycle-ramp";
import type { ComputedMesocycle } from "./types";

export type VolumeCurveInput = {
  totalWeeks: number;
  phaseKindsByWeek: PhaseKind[];
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

/**
 * Build weekly hours: step from start to peak at mesocycle boundaries in base/build,
 * race prep at 90%, taper 70%→45%, then apply de-load volume multiplier.
 */
export function computeWeeklyVolumeCurve(input: VolumeCurveInput): number[] {
  const {
    totalWeeks,
    phaseKindsByWeek,
    mesocycles,
    startHours,
    peakHours,
    deLoadFlags,
    deLoadVolumePercent,
  } = input;

  const hours: number[] = [];
  let taperCounter = 0;
  const taperWeekCount = phaseKindsByWeek.filter((k) => k === "TAPER").length;
  const rampMesoList = rampMesocycles(mesocycles, phaseKindsByWeek);

  for (let i = 0; i < totalWeeks; i++) {
    const kind = phaseKindsByWeek[i] ?? "BUILD";
    let base: number;

    if (kind === "TAPER") {
      base = peakHours * taperFactor(taperCounter, taperWeekCount);
      taperCounter += 1;
    } else if (kind === "RACE_PREP") {
      base = peakHours * RACE_PREP_VOLUME_FACTOR;
    } else {
      const step = mesocycleRampStepIndex(i, rampMesoList);
      base =
        step == null
          ? peakHours
          : mesocycleSteppedValue(startHours, peakHours, step, rampMesoList.length);
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
