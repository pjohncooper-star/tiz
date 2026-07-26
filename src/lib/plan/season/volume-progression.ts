import type { VolumeMesocycleMode, VolumeProgressionMode } from "@prisma/client";
import {
  weeklyCompoundVolumeAtWeek,
  volumeEndFromStartAndRamp,
  roundHours,
} from "./volume-ramp-triad";

export type VolumeProgressionModeValue = VolumeProgressionMode;

export const VOLUME_PROGRESSION_MODES = ["TARGET", "PERCENT", "STEP"] as const;

export const VOLUME_PROGRESSION_MODE_LABELS: Record<VolumeProgressionMode, string> = {
  TARGET: "Target (start → end)",
  PERCENT: "Percent / week",
  STEP: "Absolute step / week",
};

/** Infer progression mode for legacy phases that only set end and/or ramp%. */
export function inferVolumeProgressionMode(input: {
  volumeProgressionMode?: VolumeProgressionMode | null;
  volumeEndHours?: number | null;
  volumeRampPercent?: number | null;
  volumeStepHours?: number | null;
  swimEndHours?: number | null;
  swimRampPercent?: number | null;
  swimStepHours?: number | null;
  bikeEndHours?: number | null;
  bikeRampPercent?: number | null;
  bikeStepHours?: number | null;
  runEndHours?: number | null;
  runRampPercent?: number | null;
  runStepHours?: number | null;
}): VolumeProgressionMode {
  if (input.volumeProgressionMode) return input.volumeProgressionMode;

  const hasStep =
    input.volumeStepHours != null ||
    input.swimStepHours != null ||
    input.bikeStepHours != null ||
    input.runStepHours != null;
  if (hasStep) return "STEP";

  const hasRamp =
    input.volumeRampPercent != null ||
    input.swimRampPercent != null ||
    input.bikeRampPercent != null ||
    input.runRampPercent != null;
  const hasEnd =
    input.volumeEndHours != null ||
    input.swimEndHours != null ||
    input.bikeEndHours != null ||
    input.runEndHours != null;

  if (hasRamp && !hasEnd) return "PERCENT";
  return "TARGET";
}

export function volumeEndFromStartAndStep(
  startHours: number,
  stepHours: number,
  weekCount: number,
  mode: VolumeMesocycleMode
): number {
  if (weekCount <= 1 || mode === "HOLD") return roundHours(startHours);
  const steps = weekCount - 1;
  if (mode === "DECREASE") {
    return roundHours(Math.max(0, startHours - stepHours * steps));
  }
  return roundHours(startHours + stepHours * steps);
}

export function weeklyStepVolumeAtWeek(
  startHours: number,
  stepHours: number,
  weekOffset: number,
  mode: VolumeMesocycleMode
): number {
  if (startHours <= 0 || weekOffset <= 0 || mode === "HOLD") {
    return roundHours(startHours);
  }
  if (mode === "DECREASE") {
    return roundHours(Math.max(0, startHours - stepHours * weekOffset));
  }
  return roundHours(startHours + stepHours * weekOffset);
}

function applyCap(
  value: number,
  cap: number | null | undefined,
  mode: VolumeMesocycleMode
): number {
  if (cap == null || !Number.isFinite(cap)) return value;
  if (mode === "DECREASE") return Math.max(value, cap);
  if (mode === "INCREASE") return Math.min(value, cap);
  return value;
}

/** Volume at a non-rest progress offset within a phase. */
export function volumeAtProgressionWeek(input: {
  entry: number;
  exit?: number | null;
  rampPercent?: number | null;
  stepHours?: number | null;
  progressionMode: VolumeProgressionMode;
  mesocycleMode: VolumeMesocycleMode;
  weekOffset: number;
  weekCount: number;
  rampOn: boolean;
}): number {
  const {
    entry,
    exit,
    rampPercent,
    stepHours,
    progressionMode,
    mesocycleMode,
    weekOffset,
    weekCount,
    rampOn,
  } = input;

  if (!rampOn) {
    return roundHours(exit ?? entry);
  }

  if (progressionMode === "PERCENT") {
    const rate = rampPercent ?? 0;
    const value = weeklyCompoundVolumeAtWeek(entry, rate, weekOffset, mesocycleMode);
    return roundHours(applyCap(value, exit, mesocycleMode));
  }

  if (progressionMode === "STEP") {
    const step = stepHours ?? 0;
    const value = weeklyStepVolumeAtWeek(entry, step, weekOffset, mesocycleMode);
    return roundHours(applyCap(value, exit, mesocycleMode));
  }

  // TARGET — linear between entry and exit
  const resolvedExit =
    exit ??
    (rampPercent != null
      ? volumeEndFromStartAndRamp(entry, rampPercent, weekCount, mesocycleMode)
      : entry);
  if (weekCount <= 1) return roundHours(resolvedExit);
  const t = weekOffset / Math.max(weekCount - 1, 1);
  return roundHours(entry + (resolvedExit - entry) * t);
}

export function resolveProgressionExit(input: {
  entry: number;
  exit?: number | null;
  rampPercent?: number | null;
  stepHours?: number | null;
  progressionMode: VolumeProgressionMode;
  mesocycleMode: VolumeMesocycleMode;
  weekCount: number;
}): number {
  const { entry, exit, rampPercent, stepHours, progressionMode, mesocycleMode, weekCount } =
    input;

  if (progressionMode === "TARGET") {
    if (exit != null) return roundHours(exit);
    if (rampPercent != null) {
      return volumeEndFromStartAndRamp(entry, rampPercent, weekCount, mesocycleMode);
    }
    return roundHours(entry);
  }

  if (progressionMode === "PERCENT") {
    const compounded = volumeEndFromStartAndRamp(
      entry,
      rampPercent ?? 0,
      weekCount,
      mesocycleMode
    );
    return roundHours(applyCap(compounded, exit, mesocycleMode));
  }

  const stepped = volumeEndFromStartAndStep(
    entry,
    stepHours ?? 0,
    weekCount,
    mesocycleMode
  );
  return roundHours(applyCap(stepped, exit, mesocycleMode));
}
