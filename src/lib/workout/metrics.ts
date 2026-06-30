import type { Discipline } from "@prisma/client";
import type { PlanDiscipline } from "@/lib/plan/session";
import {
  derivePlannedMetricsFromPlanningSteps,
  derivePlannedMetricsFromWorkoutSteps,
  type DerivePlannedMetricsOptions,
} from "@/lib/workout/planned-metrics-from-steps";
import { flattenForPlanning, parseWorkoutTree } from "@/lib/workout/workout-tree";
import type { WorkoutStep } from "@/lib/workout/steps";
import type { PoolSize } from "@/lib/units/discipline-settings";
import { poolSizeForSwimStep } from "@/lib/units/discipline-settings";
import { formatPace, parsePaceInput, thresholdPaceToInput } from "@/lib/units/pace";
import { formatDisplayNumber } from "@/lib/format-display-number";

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;
const METERS_PER_YARD = 0.9144;
const YARDS_PER_METER = 1 / METERS_PER_YARD;
const MPS_PER_KPH = 1 / 3.6;
const KPH_PER_MPS = 3.6;
const MPH_PER_MPS = 2.2369362921;

export type DisplayUnit = "METRIC" | "IMPERIAL";

export type SessionMetrics = {
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
};

export function parseOptionalPositive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function distanceInputToMeters(
  input: string,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit = "METRIC"
): number | null {
  return reportingDistanceInputToMeters(input, discipline, displayUnit);
}

export function distanceMetersToInput(
  meters: number | null | undefined,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit = "METRIC"
): string {
  return reportingDistanceMetersToInput(meters, discipline, displayUnit);
}

export function distanceInputLabel(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit = "METRIC"
): string {
  return reportingDistanceInputLabel(discipline, displayUnit);
}

export function reportingDistanceInputLabel(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit
): string {
  if (discipline === "SWIM") {
    return displayUnit === "METRIC" ? "Distance (m)" : "Distance (yd)";
  }
  return displayUnit === "METRIC" ? "Distance (km)" : "Distance (mi)";
}

export function reportingDistanceInputToMeters(
  input: string,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit
): number | null {
  const n = parseOptionalPositive(input);
  if (n === null) return null;
  if (discipline === "SWIM") {
    return displayUnit === "METRIC" ? n : n * METERS_PER_YARD;
  }
  return displayUnit === "METRIC" ? n * METERS_PER_KM : n * METERS_PER_MILE;
}

export function reportingDistanceMetersToInput(
  meters: number | null | undefined,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit
): string {
  if (!meters || meters <= 0) return "";
  if (discipline === "SWIM") {
    if (displayUnit === "METRIC") return String(Math.round(meters));
    return String(Math.round(meters * YARDS_PER_METER));
  }
  if (displayUnit === "METRIC") {
    const km = meters / METERS_PER_KM;
    return Number.isInteger(km) ? String(km) : km.toFixed(1);
  }
  const mi = meters / METERS_PER_MILE;
  return Number.isInteger(mi) ? String(mi) : mi.toFixed(1);
}

export function stepDistanceInputLabel(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): string {
  if (discipline === "SWIM") {
    return poolSizeForSwimStep(poolSize) === "SCY" ? "Distance (yd)" : "Distance (m)";
  }
  return reportingDistanceInputLabel(discipline, displayUnit);
}

export function stepDistanceInputToMeters(
  input: string,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): number | null {
  const n = parseOptionalPositive(input);
  if (n === null) return null;
  if (discipline === "SWIM") {
    return poolSizeForSwimStep(poolSize) === "SCY" ? n * METERS_PER_YARD : n;
  }
  return reportingDistanceInputToMeters(input, discipline, displayUnit);
}

export function stepDistanceMetersToInput(
  meters: number | null | undefined,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): string {
  if (!meters || meters <= 0) return "";
  if (discipline === "SWIM") {
    if (poolSizeForSwimStep(poolSize) === "SCY") {
      return String(Math.round(meters * YARDS_PER_METER));
    }
    return String(Math.round(meters));
  }
  return reportingDistanceMetersToInput(meters, discipline, displayUnit);
}

export function speedInputToMps(input: string, displayUnit: DisplayUnit): number | null {
  const n = parseOptionalPositive(input);
  if (n === null) return null;
  const kph = displayUnit === "METRIC" ? n : n / MPH_PER_MPS * KPH_PER_MPS;
  return kph * MPS_PER_KPH;
}

export function speedMpsToInput(mps: number | null | undefined, displayUnit: DisplayUnit): string {
  if (!mps || mps <= 0) return "";
  const value = displayUnit === "METRIC" ? mps * KPH_PER_MPS : mps * MPH_PER_MPS;
  return value.toFixed(1);
}

export function speedInputLabel(displayUnit: DisplayUnit): string {
  return displayUnit === "METRIC" ? "Speed (km/h)" : "Speed (mph)";
}

export function paceInputToCanonical(
  input: string,
  discipline: "RUN" | "SWIM",
  displayUnit: DisplayUnit
): number | null {
  const secPerUnit = parsePaceInput(input);
  if (secPerUnit === null) return null;
  if (discipline === "SWIM") {
    return displayUnit === "METRIC" ? secPerUnit : secPerUnit * (100 / 91.44);
  }
  return displayUnit === "METRIC" ? secPerUnit : secPerUnit / (1609.344 / 1000);
}

export function paceCanonicalToInput(
  seconds: number | null | undefined,
  discipline: "RUN" | "SWIM",
  displayUnit: DisplayUnit
): string {
  if (!seconds || seconds <= 0) return "";
  return thresholdPaceToInput(seconds, discipline, displayUnit);
}

export function paceInputLabel(
  discipline: "RUN" | "SWIM",
  displayUnit: DisplayUnit
): string {
  if (discipline === "SWIM") {
    return displayUnit === "METRIC" ? "Pace (min/100m)" : "Pace (min/100yd)";
  }
  return displayUnit === "METRIC" ? "Pace (min/km)" : "Pace (min/mi)";
}

export function stepPaceInputLabel(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): string {
  if (discipline === "SWIM") {
    return poolSizeForSwimStep(poolSize) === "SCY" ? "Pace (min/100yd)" : "Pace (min/100m)";
  }
  if (discipline === "RUN") {
    return paceInputLabel(discipline, displayUnit);
  }
  return "";
}

export function stepPaceInputToCanonical(
  input: string,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): number | null {
  if (discipline === "RUN") {
    return paceInputToCanonical(input, discipline, displayUnit);
  }
  if (discipline !== "SWIM") return null;
  const swimUnit: DisplayUnit = poolSizeForSwimStep(poolSize) === "SCY" ? "IMPERIAL" : "METRIC";
  return paceInputToCanonical(input, "SWIM", swimUnit);
}

export function stepPaceCanonicalToInput(
  seconds: number | null | undefined,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): string {
  if (discipline === "RUN") {
    return paceCanonicalToInput(seconds, discipline, displayUnit);
  }
  if (discipline !== "SWIM") return "";
  const swimUnit: DisplayUnit = poolSizeForSwimStep(poolSize) === "SCY" ? "IMPERIAL" : "METRIC";
  return paceCanonicalToInput(seconds, "SWIM", swimUnit);
}

export function formatSessionDistance(
  meters: number | null | undefined,
  discipline: Discipline | PlanDiscipline,
  displayUnit: DisplayUnit
): string | null {
  if (!meters || meters <= 0) return null;
  if (discipline === "SWIM") {
    if (displayUnit === "METRIC") {
      return `${formatDisplayNumber(Math.round(meters), 0)} m`;
    }
    const yd = meters * YARDS_PER_METER;
    return `${formatDisplayNumber(Math.round(yd), 0)} yd`;
  }
  if (displayUnit === "METRIC") {
    return `${formatDisplayNumber(meters / METERS_PER_KM)} km`;
  }
  return `${formatDisplayNumber(meters / METERS_PER_MILE)} mi`;
}

export function formatSessionSpeed(
  mps: number | null | undefined,
  displayUnit: DisplayUnit
): string | null {
  if (!mps || mps <= 0) return null;
  if (displayUnit === "METRIC") {
    return `${(mps * KPH_PER_MPS).toFixed(1)} km/h`;
  }
  return `${(mps * MPH_PER_MPS).toFixed(1)} mph`;
}

export function formatSessionPace(
  seconds: number | null | undefined,
  discipline: "RUN" | "SWIM",
  displayUnit: DisplayUnit
): string | null {
  if (!seconds || seconds <= 0) return null;
  if (discipline === "SWIM") {
    const unit = displayUnit === "METRIC" ? "100m" : "100yd";
    return `${formatPace(seconds, unit)} /${unit}`;
  }
  const unit = displayUnit === "METRIC" ? "km" : "mi";
  return `${formatPace(seconds, unit)} /${unit}`;
}

export function summarizeStepMetrics(steps: WorkoutStep[]): SessionMetrics {
  let distanceMeters = 0;
  let hasDistance = false;
  let speedWeighted = 0;
  let speedWeight = 0;
  let paceWeighted = 0;
  let paceWeight = 0;

  for (const step of steps) {
    if (step.distanceMeters && step.distanceMeters > 0) {
      distanceMeters += step.distanceMeters;
      hasDistance = true;
    }
    if (step.targetSpeedMps && step.targetSpeedMps > 0) {
      const w = step.durationMinutes > 0 ? step.durationMinutes : 1;
      speedWeighted += step.targetSpeedMps * w;
      speedWeight += w;
    }
    if (step.targetPaceSeconds && step.targetPaceSeconds > 0) {
      const w = step.durationMinutes > 0 ? step.durationMinutes : 1;
      paceWeighted += step.targetPaceSeconds * w;
      paceWeight += w;
    }
  }

  return {
    distanceMeters: hasDistance ? distanceMeters : null,
    targetSpeedMps: speedWeight > 0 ? speedWeighted / speedWeight : null,
    targetPaceSeconds: paceWeight > 0 ? paceWeighted / paceWeight : null,
  };
}

export function resolveSessionMetrics(
  session: SessionMetrics,
  steps: WorkoutStep[],
  discipline?: Discipline,
  options?: DerivePlannedMetricsOptions & { structuredSteps?: unknown }
): SessionMetrics {
  const { structuredSteps, ...paceOptions } = options ?? {};
  let fromSteps: SessionMetrics;
  if (structuredSteps && (discipline === "RUN" || discipline === "SWIM")) {
    fromSteps = derivePlannedMetricsFromPlanningSteps(
      discipline,
      flattenForPlanning(parseWorkoutTree(structuredSteps).nodes),
      paceOptions
    );
  } else if (discipline === "RUN" || discipline === "SWIM") {
    fromSteps = derivePlannedMetricsFromWorkoutSteps(discipline, steps, paceOptions);
  } else {
    fromSteps = summarizeStepMetrics(steps);
  }
  return {
    distanceMeters: session.distanceMeters ?? fromSteps.distanceMeters,
    targetSpeedMps: session.targetSpeedMps ?? fromSteps.targetSpeedMps,
    targetPaceSeconds: session.targetPaceSeconds ?? fromSteps.targetPaceSeconds,
  };
}

export function formatSessionMetricsSummary(
  metrics: SessionMetrics,
  discipline: Discipline | PlanDiscipline,
  displayUnit: DisplayUnit
): string | null {
  const parts: string[] = [];
  const dist = formatSessionDistance(metrics.distanceMeters, discipline, displayUnit);
  if (dist) parts.push(dist);
  if (discipline === "BIKE") {
    const speed = formatSessionSpeed(metrics.targetSpeedMps, displayUnit);
    if (speed) parts.push(speed);
  } else {
    const pace = formatSessionPace(
      metrics.targetPaceSeconds,
      discipline as "RUN" | "SWIM",
      displayUnit
    );
    if (pace) parts.push(pace);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
