import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { paceSecondsAtZoneMidpoint } from "@/lib/workout/zone-pace";
import type { FlatPlanningStep } from "@/lib/workout/workout-tree";

const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

export const FALLBACK_THRESHOLD_PACE: Record<"RUN" | "SWIM", number> = {
  RUN: 300,
  SWIM: 90,
};

export type DistanceDurationOptions = {
  discipline?: "RUN" | "SWIM" | null;
  thresholdPaceSeconds?: number | null;
  zoneBoundaries?: number[];
  /** Bike FTP for mapping absolute watt targets → zones. */
  thresholdFtpWatts?: number | null;
  /** Power % boundaries (defaults to BIKE POWER defaults when omitted). */
  powerZoneBoundaries?: number[];
};

export function effectiveThresholdPaceSeconds(
  discipline: "RUN" | "SWIM",
  thresholdPaceSeconds?: number | null
): number {
  if (thresholdPaceSeconds != null && thresholdPaceSeconds > 0) {
    return thresholdPaceSeconds;
  }
  return FALLBACK_THRESHOLD_PACE[discipline];
}

export function durationSecondsFromDistancePace(
  discipline: "RUN" | "SWIM",
  distanceMeters: number,
  paceSeconds: number
): number {
  if (!(distanceMeters > 0) || !(paceSeconds > 0)) return 0;
  if (discipline === "RUN") {
    return (distanceMeters / METERS_PER_KM) * paceSeconds;
  }
  return (distanceMeters / METERS_PER_100M) * paceSeconds;
}

/** Estimate duration for a distance-based flat step; returns 0 if not estimable. */
export function estimateDistanceStepDurationSeconds(
  step: Pick<FlatPlanningStep, "distanceMeters" | "targetZone" | "targetPaceSeconds">,
  options: DistanceDurationOptions
): number {
  const discipline = options.discipline;
  if (discipline !== "RUN" && discipline !== "SWIM") return 0;
  const distanceMeters = step.distanceMeters ?? 0;
  if (!(distanceMeters > 0)) return 0;

  let pace =
    step.targetPaceSeconds != null && step.targetPaceSeconds > 0
      ? step.targetPaceSeconds
      : 0;
  if (!(pace > 0) && step.targetZone >= 1) {
    const boundaries =
      options.zoneBoundaries ?? zoneBoundariesFor(discipline, "PACE");
    const threshold = effectiveThresholdPaceSeconds(
      discipline,
      options.thresholdPaceSeconds
    );
    pace = paceSecondsAtZoneMidpoint(step.targetZone, threshold, boundaries);
  }
  return durationSecondsFromDistancePace(discipline, distanceMeters, pace);
}

/** Fill durationMinutes/Seconds on a distance flat step when estimable. */
export function enrichDistanceFlatStep(
  step: FlatPlanningStep,
  options: DistanceDurationOptions
): FlatPlanningStep {
  if (step.durationSeconds > 0 || step.durationMinutes > 0) return step;
  if (!(step.distanceMeters != null && step.distanceMeters > 0)) return step;
  const sec = estimateDistanceStepDurationSeconds(step, options);
  if (!(sec > 0)) return step;
  return {
    ...step,
    durationSeconds: sec,
    durationMinutes: Math.max(1, Math.round(sec / 60)),
  };
}
