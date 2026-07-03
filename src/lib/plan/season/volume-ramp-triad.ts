import type { VolumeMesocycleMode } from "@prisma/client";

/** Compound weekly change: week 0 = start, week 1 = start × factor, week 2 = start × factor², … */
export function weeklyVolumeFactor(rampPercent: number, mode: VolumeMesocycleMode): number {
  if (mode === "HOLD") return 1;
  return mode === "INCREASE" ? 1 + rampPercent / 100 : 1 - rampPercent / 100;
}

/** Volume at weekOffset within a phase (0 = first week of phase). */
export function weeklyCompoundVolumeAtWeek(
  startHours: number,
  rampPercent: number,
  weekOffset: number,
  mode: VolumeMesocycleMode
): number {
  if (startHours <= 0 || weekOffset <= 0) return roundHours(startHours);
  if (mode === "HOLD") return roundHours(startHours);
  const factor = weeklyVolumeFactor(rampPercent, mode);
  return roundHours(startHours * factor ** weekOffset);
}

/** Last week of phase when ramping weekly (for chaining to next phase). */
export function volumeEndFromStartAndRamp(
  startHours: number,
  rampPercent: number,
  weekCount: number,
  mode: VolumeMesocycleMode
): number {
  if (weekCount <= 1) return roundHours(startHours);
  return weeklyCompoundVolumeAtWeek(startHours, rampPercent, weekCount - 1, mode);
}

/** Implied constant weekly ramp % from first and last week of phase. */
export function volumeRampPercentFromStartAndEnd(
  startHours: number,
  endHours: number,
  weekCount: number,
  mode: VolumeMesocycleMode
): number | null {
  if (startHours <= 0 || weekCount <= 1) return mode === "HOLD" ? 0 : null;
  if (mode === "HOLD") return 0;

  const ratio = endHours / startHours;
  const steps = weekCount - 1;

  if (mode === "INCREASE") {
    if (ratio <= 0) return null;
    if (Math.abs(ratio - 1) < 1e-9) return 0;
    return roundPercent((ratio ** (1 / steps) - 1) * 100);
  }

  if (ratio <= 0 || ratio > 1) return null;
  if (Math.abs(ratio - 1) < 1e-9) return 0;
  return roundPercent((1 - ratio ** (1 / steps)) * 100);
}

export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function roundPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}
