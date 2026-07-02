import type { PhaseKind } from "@prisma/client";
import type { ComputedMesocycle } from "./types";

export function isRampPhaseKind(kind: PhaseKind): boolean {
  return kind === "BASE" || kind === "BUILD";
}

/** Mesocycles whose macro phase ramps volume and long sessions (base/build only). */
export function rampMesocycles(
  mesocycles: ComputedMesocycle[],
  phaseKindsByWeek: PhaseKind[]
): ComputedMesocycle[] {
  return mesocycles.filter((meso) => {
    const kind = phaseKindsByWeek[meso.startWeekIndex] ?? "BUILD";
    return isRampPhaseKind(kind);
  });
}

export function mesocycleRampStepIndex(
  weekIndex: number,
  rampMesocycleList: ComputedMesocycle[]
): number | null {
  const index = rampMesocycleList.findIndex(
    (meso) => weekIndex >= meso.startWeekIndex && weekIndex <= meso.endWeekIndex
  );
  return index >= 0 ? index : null;
}

/** Progress 0 at first ramp mesocycle, 1 at last. */
export function mesocycleRampProgress(
  stepIndex: number,
  rampMesocycleCount: number
): number {
  if (rampMesocycleCount <= 1) return 0;
  return stepIndex / (rampMesocycleCount - 1);
}

export function mesocycleSteppedValue(
  start: number,
  peak: number,
  stepIndex: number,
  rampMesocycleCount: number
): number {
  const progress = mesocycleRampProgress(stepIndex, rampMesocycleCount);
  return start + (peak - start) * progress;
}

export function lastRampMesocyclePlateau(
  rampMesocycleList: ComputedMesocycle[],
  start: number,
  peak: number
): number {
  if (rampMesocycleList.length === 0) return peak;
  return mesocycleSteppedValue(
    start,
    peak,
    rampMesocycleList.length - 1,
    rampMesocycleList.length
  );
}
