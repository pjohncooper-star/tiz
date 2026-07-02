import type { PhaseKind, VolumeMesocycleMode } from "@prisma/client";
import { RACE_PREP_VOLUME_FACTOR } from "./constants";
import {
  mesocycleRampStepIndex,
  mesocycleSteppedValue,
} from "./mesocycle-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

export type SeasonVolumeAnchors = {
  startHours: number;
  peakHours: number;
  longRideStartMin: number;
  longRidePeakMin: number;
  longRunStartMin: number;
  longRunPeakMin: number;
};

export type ResolvedPhaseTargets = {
  phaseIndex: number;
  phaseId?: string;
  phaseKind: PhaseKind;
  mode: VolumeMesocycleMode;
  weekStart: number;
  weekEnd: number;
  volumeEntry: number;
  volumeExit: number;
  longRideEntry: number;
  longRideExit: number;
  longRunEntry: number;
  longRunExit: number;
};

export function defaultVolumeMesocycleMode(phaseKind: PhaseKind): VolumeMesocycleMode {
  switch (phaseKind) {
    case "BASE":
      return "INCREASE";
    case "BUILD":
      return "HOLD";
    case "RACE_PREP":
      return "DECREASE";
    case "TAPER":
      return "HOLD";
  }
}

function isRampPhaseKind(phaseKind: PhaseKind): boolean {
  return phaseKind !== "TAPER";
}

function defaultVolumeExit(
  phase: SeasonPhaseInput,
  mode: VolumeMesocycleMode,
  anchors: SeasonVolumeAnchors,
  nextRampPhase: SeasonPhaseInput | undefined
): number {
  if (phase.phaseKind === "RACE_PREP") {
    return anchors.peakHours * RACE_PREP_VOLUME_FACTOR;
  }
  if (mode === "DECREASE") {
    if (nextRampPhase?.phaseKind === "RACE_PREP") {
      return anchors.peakHours * RACE_PREP_VOLUME_FACTOR;
    }
    return anchors.peakHours * RACE_PREP_VOLUME_FACTOR;
  }
  return anchors.peakHours;
}

export function scaleLongMinFromVolume(
  volumeValue: number,
  anchors: SeasonVolumeAnchors,
  seasonStartMin: number,
  seasonPeakMin: number
): number {
  const span = anchors.peakHours - anchors.startHours;
  if (span === 0) return seasonPeakMin;
  const t = (volumeValue - anchors.startHours) / span;
  return Math.round(seasonStartMin + (seasonPeakMin - seasonStartMin) * t);
}

export function resolvePhaseTargets(
  phases: SeasonPhaseInput[],
  anchors: SeasonVolumeAnchors
): ResolvedPhaseTargets[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: ResolvedPhaseTargets[] = [];
  let weekCursor = 0;
  let previousVolumeExit: number | null = null;
  let isFirstRampPhase = true;

  for (let phaseIndex = 0; phaseIndex < sorted.length; phaseIndex++) {
    const phase = sorted[phaseIndex]!;
    const weekStart = weekCursor;
    const weekEnd = weekCursor + phase.weekCount;
    weekCursor = weekEnd;

    if (!isRampPhaseKind(phase.phaseKind)) {
      continue;
    }

    const mode = phase.volumeMesocycleMode ?? defaultVolumeMesocycleMode(phase.phaseKind);
    const nextRampPhase = sorted
      .slice(phaseIndex + 1)
      .find((p) => isRampPhaseKind(p.phaseKind));

    const chainedVolumeEntry = isFirstRampPhase
      ? anchors.startHours
      : (previousVolumeExit ?? anchors.peakHours);

    const volumeEntry = phase.volumeStartHours ?? chainedVolumeEntry;
    const volumeExit =
      phase.volumeEndHours ?? defaultVolumeExit(phase, mode, anchors, nextRampPhase);

    const longRideEntry =
      phase.longRideStartMin ??
      scaleLongMinFromVolume(
        volumeEntry,
        anchors,
        anchors.longRideStartMin,
        anchors.longRidePeakMin
      );
    const longRideExit =
      phase.longRideEndMin ??
      (phase.phaseKind === "RACE_PREP"
        ? Math.round(anchors.longRidePeakMin * RACE_PREP_VOLUME_FACTOR)
        : scaleLongMinFromVolume(
            volumeExit,
            anchors,
            anchors.longRideStartMin,
            anchors.longRidePeakMin
          ));
    const longRunEntry =
      phase.longRunStartMin ??
      scaleLongMinFromVolume(
        volumeEntry,
        anchors,
        anchors.longRunStartMin,
        anchors.longRunPeakMin
      );
    const longRunExit =
      phase.longRunEndMin ??
      (phase.phaseKind === "RACE_PREP"
        ? Math.round(anchors.longRunPeakMin * RACE_PREP_VOLUME_FACTOR)
        : scaleLongMinFromVolume(
            volumeExit,
            anchors,
            anchors.longRunStartMin,
            anchors.longRunPeakMin
          ));

    result.push({
      phaseIndex,
      phaseId: phase.id,
      phaseKind: phase.phaseKind,
      mode,
      weekStart,
      weekEnd,
      volumeEntry,
      volumeExit,
      longRideEntry,
      longRideExit,
      longRunEntry,
      longRunExit,
    });

    previousVolumeExit = volumeExit;
    isFirstRampPhase = false;
  }

  return result;
}

export function phaseIndexForWeek(
  phases: SeasonPhaseInput[],
  weekIndex: number
): number | null {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const phase = sorted[i]!;
    if (weekIndex >= cursor && weekIndex < cursor + phase.weekCount) {
      return i;
    }
    cursor += phase.weekCount;
  }
  return null;
}

export function mesocyclesForPhase(
  mesocycles: ComputedMesocycle[],
  phaseIndex: number
): ComputedMesocycle[] {
  return mesocycles.filter((m) => m.phaseIndex === phaseIndex);
}

export function phaseMesocyclePlateau(
  weekIndex: number,
  phaseMesos: ComputedMesocycle[],
  entry: number,
  exit: number,
  mode: VolumeMesocycleMode
): number {
  if (mode === "HOLD") {
    return exit;
  }

  const mesoCount = phaseMesos.length;
  if (mesoCount <= 1) {
    return exit;
  }

  const step = mesocycleRampStepIndex(weekIndex, phaseMesos);
  if (step === null) {
    return exit;
  }

  return mesocycleSteppedValue(entry, exit, step, mesoCount);
}

export type PlateauMetric = "volume" | "longRide" | "longRun";

export function plateauForWeek(
  weekIndex: number,
  phases: SeasonPhaseInput[],
  mesocycles: ComputedMesocycle[],
  resolved: ResolvedPhaseTargets[],
  metric: PlateauMetric
): number | null {
  const phaseIndex = phaseIndexForWeek(phases, weekIndex);
  if (phaseIndex === null) {
    return null;
  }

  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const phase = sorted[phaseIndex]!;
  if (!isRampPhaseKind(phase.phaseKind)) {
    return null;
  }

  const targets = resolved.find((t) => t.phaseIndex === phaseIndex);
  if (!targets) {
    return null;
  }

  const phaseMesos = mesocyclesForPhase(mesocycles, phaseIndex);
  const entry =
    metric === "volume"
      ? targets.volumeEntry
      : metric === "longRide"
        ? targets.longRideEntry
        : targets.longRunEntry;
  const exit =
    metric === "volume"
      ? targets.volumeExit
      : metric === "longRide"
        ? targets.longRideExit
        : targets.longRunExit;

  return phaseMesocyclePlateau(weekIndex, phaseMesos, entry, exit, targets.mode);
}
