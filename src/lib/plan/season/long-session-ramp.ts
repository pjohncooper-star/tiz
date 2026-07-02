import type { PhaseKind } from "@prisma/client";
import {
  lastRampMesocyclePlateau,
  mesocycleRampStepIndex,
  mesocycleSteppedValue,
  rampMesocycles,
} from "./mesocycle-ramp";
import type { ComputedMesocycle } from "./types";

export type LongSessionRampInput = {
  weekIndex: number;
  phaseKindsByWeek: PhaseKind[];
  mesocycles: ComputedMesocycle[];
  startMin: number;
  peakMin: number;
};

function fullPlateauMinutesForWeek(
  weekIndex: number,
  phaseKindsByWeek: PhaseKind[],
  mesocycles: ComputedMesocycle[],
  startMin: number,
  peakMin: number
): number {
  const kind = phaseKindsByWeek[weekIndex] ?? "BUILD";
  const rampMesoList = rampMesocycles(mesocycles, phaseKindsByWeek);
  const peakPlateau = lastRampMesocyclePlateau(rampMesoList, startMin, peakMin);

  if (kind === "TAPER" || kind === "RACE_PREP") {
    return Math.round(peakPlateau);
  }

  const step = mesocycleRampStepIndex(weekIndex, rampMesoList);
  if (step == null) {
    return Math.round(peakPlateau);
  }

  return Math.round(
    mesocycleSteppedValue(startMin, peakMin, step, rampMesoList.length)
  );
}

/**
 * Full long-session plateau before per-week tier (full vs medium) is applied.
 */
export function computeLongSessionMinutes(input: LongSessionRampInput): number {
  const { weekIndex, phaseKindsByWeek, mesocycles, startMin, peakMin } = input;
  return fullPlateauMinutesForWeek(
    weekIndex,
    phaseKindsByWeek,
    mesocycles,
    startMin,
    peakMin
  );
}

export function computeLongSessionsForWeek(
  weekIndex: number,
  phaseKindsByWeek: PhaseKind[],
  mesocycles: ComputedMesocycle[],
  longRide: { startMin: number; peakMin: number },
  longRun: { startMin: number; peakMin: number }
): { longRideMinutes: number; longRunMinutes: number } {
  return {
    longRideMinutes: computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      mesocycles,
      startMin: longRide.startMin,
      peakMin: longRide.peakMin,
    }),
    longRunMinutes: computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      mesocycles,
      startMin: longRun.startMin,
      peakMin: longRun.peakMin,
    }),
  };
}
