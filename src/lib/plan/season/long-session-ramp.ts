import type { PhaseKind } from "@prisma/client";
import {
  plateauForWeek,
  resolvePhaseTargets,
  type SeasonVolumeAnchors,
} from "./phase-volume-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

export type LongSessionRampInput = {
  weekIndex: number;
  phaseKindsByWeek: PhaseKind[];
  phases: SeasonPhaseInput[];
  mesocycles: ComputedMesocycle[];
  anchors: SeasonVolumeAnchors;
};

function fullPlateauMinutesForWeek(
  weekIndex: number,
  phaseKindsByWeek: PhaseKind[],
  phases: SeasonPhaseInput[],
  mesocycles: ComputedMesocycle[],
  anchors: SeasonVolumeAnchors,
  metric: "longRide" | "longRun"
): number {
  const kind = phaseKindsByWeek[weekIndex] ?? "BUILD";
  if (kind === "TAPER") {
    const resolved = resolvePhaseTargets(phases, anchors);
    const lastRamp = resolved[resolved.length - 1];
    return Math.round(
      metric === "longRide"
        ? (lastRamp?.longRideExit ?? anchors.longRidePeakMin)
        : (lastRamp?.longRunExit ?? anchors.longRunPeakMin)
    );
  }

  const resolved = resolvePhaseTargets(phases, anchors);
  const plateau = plateauForWeek(weekIndex, phases, mesocycles, resolved, metric);
  if (plateau != null) {
    return Math.round(plateau);
  }

  return Math.round(
    metric === "longRide" ? anchors.longRidePeakMin : anchors.longRunPeakMin
  );
}

/**
 * Full long-session plateau before per-week tier (full vs medium) is applied.
 */
export function computeLongSessionMinutes(
  input: LongSessionRampInput & {
    metric: "longRide" | "longRun";
  }
): number {
  const { weekIndex, phaseKindsByWeek, phases, mesocycles, anchors, metric } = input;
  return fullPlateauMinutesForWeek(
    weekIndex,
    phaseKindsByWeek,
    phases,
    mesocycles,
    anchors,
    metric
  );
}

export function computeLongSessionsForWeek(
  weekIndex: number,
  phaseKindsByWeek: PhaseKind[],
  phases: SeasonPhaseInput[],
  mesocycles: ComputedMesocycle[],
  volume: { startHours: number; peakHours: number },
  longRide: { startMin: number; peakMin: number },
  longRun: { startMin: number; peakMin: number }
): { longRideMinutes: number; longRunMinutes: number } {
  const anchors: SeasonVolumeAnchors = {
    startHours: volume.startHours,
    peakHours: volume.peakHours,
    longRideStartMin: longRide.startMin,
    longRidePeakMin: longRide.peakMin,
    longRunStartMin: longRun.startMin,
    longRunPeakMin: longRun.peakMin,
  };

  return {
    longRideMinutes: computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      phases,
      mesocycles,
      anchors,
      metric: "longRide",
    }),
    longRunMinutes: computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      phases,
      mesocycles,
      anchors,
      metric: "longRun",
    }),
  };
}
