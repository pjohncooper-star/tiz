import type { PlanDiscipline } from "@/lib/plan/session";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import type { SessionMetrics } from "@/lib/workout/metrics";
import { paceSecondsAtZoneMidpoint } from "@/lib/workout/zone-pace";
import type { FlatPlanningStep } from "@/lib/workout/workout-tree";
import type { WorkoutStep } from "@/lib/workout/workout-types";

const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

const FALLBACK_THRESHOLD_PACE: Record<"RUN" | "SWIM", number> = {
  RUN: 300,
  SWIM: 90,
};

export type DerivePlannedMetricsOptions = {
  thresholdPaceSeconds?: number | null;
  zoneBoundaries?: number[];
};

function effectiveThreshold(
  discipline: "RUN" | "SWIM",
  thresholdPaceSeconds?: number | null
): number {
  if (thresholdPaceSeconds != null && thresholdPaceSeconds > 0) {
    return thresholdPaceSeconds;
  }
  return FALLBACK_THRESHOLD_PACE[discipline];
}

function stepDurationSeconds(step: FlatPlanningStep): number {
  if (step.durationSeconds > 0) return step.durationSeconds;
  if (step.durationMinutes > 0) return step.durationMinutes * 60;
  return 0;
}

function distanceFromDurationPace(
  discipline: "RUN" | "SWIM",
  durationSeconds: number,
  paceSeconds: number
): number {
  if (discipline === "RUN") {
    return (durationSeconds / paceSeconds) * METERS_PER_KM;
  }
  return (durationSeconds / paceSeconds) * METERS_PER_100M;
}

function durationFromDistancePace(
  discipline: "RUN" | "SWIM",
  distanceMeters: number,
  paceSeconds: number
): number {
  if (discipline === "RUN") {
    return (distanceMeters / METERS_PER_KM) * paceSeconds;
  }
  return (distanceMeters / METERS_PER_100M) * paceSeconds;
}

function resolveStepPaceSeconds(
  discipline: "RUN" | "SWIM",
  step: FlatPlanningStep,
  thresholdPaceSeconds: number,
  boundaries: number[]
): number | null {
  if (step.targetPaceSeconds != null && step.targetPaceSeconds > 0) {
    return step.targetPaceSeconds;
  }
  if (step.targetZone >= 1) {
    const pace = paceSecondsAtZoneMidpoint(step.targetZone, thresholdPaceSeconds, boundaries);
    return pace > 0 ? pace : null;
  }
  return null;
}

export function derivePlannedMetricsFromPlanningSteps(
  discipline: "RUN" | "SWIM",
  steps: FlatPlanningStep[],
  options: DerivePlannedMetricsOptions = {}
): SessionMetrics {
  const boundaries = options.zoneBoundaries ?? zoneBoundariesFor("PACE");
  const threshold = effectiveThreshold(discipline, options.thresholdPaceSeconds);

  let totalDistance = 0;
  let paceWeighted = 0;
  let paceWeight = 0;

  for (const step of steps) {
    const pace = resolveStepPaceSeconds(discipline, step, threshold, boundaries);
    let durationSec = stepDurationSeconds(step);
    let distanceM = step.distanceMeters ?? 0;

    if (distanceM > 0 && durationSec > 0) {
      // both set on step
    } else if (distanceM > 0 && pace) {
      durationSec = durationFromDistancePace(discipline, distanceM, pace);
    } else if (durationSec > 0 && pace) {
      distanceM = distanceFromDurationPace(discipline, durationSec, pace);
    }

    if (distanceM > 0) totalDistance += distanceM;
    if (pace && durationSec > 0) {
      paceWeighted += pace * durationSec;
      paceWeight += durationSec;
    }
  }

  return {
    distanceMeters: totalDistance > 0 ? totalDistance : null,
    targetSpeedMps: null,
    targetPaceSeconds: paceWeight > 0 ? paceWeighted / paceWeight : null,
  };
}

/** Legacy flat steps (duration + target zone, optional distance/pace). */
export function derivePlannedMetricsFromWorkoutSteps(
  discipline: "RUN" | "SWIM",
  steps: WorkoutStep[],
  options: DerivePlannedMetricsOptions = {}
): SessionMetrics {
  const flat: FlatPlanningStep[] = steps.map((s) => ({
    type: s.type,
    durationMinutes: s.durationMinutes,
    durationSeconds: s.durationMinutes > 0 ? s.durationMinutes * 60 : 0,
    targetZone: s.targetZone,
    openDuration: false,
    ...(s.distanceMeters ? { distanceMeters: s.distanceMeters } : {}),
    ...(s.targetPaceSeconds ? { targetPaceSeconds: s.targetPaceSeconds } : {}),
  }));
  return derivePlannedMetricsFromPlanningSteps(discipline, flat, options);
}

export function derivePlannedMetrics(
  discipline: PlanDiscipline,
  planningSteps: FlatPlanningStep[],
  options: DerivePlannedMetricsOptions = {}
): SessionMetrics {
  if (discipline === "RUN" || discipline === "SWIM") {
    return derivePlannedMetricsFromPlanningSteps(discipline, planningSteps, options);
  }
  return {
    distanceMeters: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
  };
}
