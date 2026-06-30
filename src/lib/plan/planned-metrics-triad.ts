import type { PlanDiscipline } from "@/lib/plan/session";

const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

export type TriadField = "duration" | "distance" | "pace";

export type PlannedMetricsTriadValues = {
  durationMinutes: number | null;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
};

export function parseDurationMinutesInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function durationMinutesToInput(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const rounded = Math.round(minutes * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function hasDuration(v: PlannedMetricsTriadValues): boolean {
  return v.durationMinutes != null && v.durationMinutes > 0;
}

function hasDistance(v: PlannedMetricsTriadValues): boolean {
  return v.distanceMeters != null && v.distanceMeters > 0;
}

function hasPace(discipline: PlanDiscipline, v: PlannedMetricsTriadValues): boolean {
  if (discipline === "BIKE") {
    return v.targetSpeedMps != null && v.targetSpeedMps > 0;
  }
  return v.targetPaceSeconds != null && v.targetPaceSeconds > 0;
}

function durationSecondsFromDistancePace(
  discipline: PlanDiscipline,
  distanceMeters: number,
  values: PlannedMetricsTriadValues
): number | null {
  if (discipline === "BIKE") {
    if (!values.targetSpeedMps || values.targetSpeedMps <= 0) return null;
    return distanceMeters / values.targetSpeedMps;
  }
  if (!values.targetPaceSeconds || values.targetPaceSeconds <= 0) return null;
  if (discipline === "RUN") {
    return (distanceMeters / METERS_PER_KM) * values.targetPaceSeconds;
  }
  return (distanceMeters / METERS_PER_100M) * values.targetPaceSeconds;
}

function distanceFromDurationPace(
  discipline: PlanDiscipline,
  durationSeconds: number,
  values: PlannedMetricsTriadValues
): number | null {
  if (discipline === "BIKE") {
    if (!values.targetSpeedMps || values.targetSpeedMps <= 0) return null;
    return values.targetSpeedMps * durationSeconds;
  }
  if (!values.targetPaceSeconds || values.targetPaceSeconds <= 0) return null;
  if (discipline === "RUN") {
    return (durationSeconds / values.targetPaceSeconds) * METERS_PER_KM;
  }
  return (durationSeconds / values.targetPaceSeconds) * METERS_PER_100M;
}

function paceFromDurationDistance(
  discipline: PlanDiscipline,
  durationSeconds: number,
  distanceMeters: number
): Pick<PlannedMetricsTriadValues, "targetSpeedMps" | "targetPaceSeconds"> | null {
  if (durationSeconds <= 0 || distanceMeters <= 0) return null;
  if (discipline === "BIKE") {
    return { targetSpeedMps: distanceMeters / durationSeconds, targetPaceSeconds: null };
  }
  if (discipline === "RUN") {
    return {
      targetSpeedMps: null,
      targetPaceSeconds: durationSeconds / (distanceMeters / METERS_PER_KM),
    };
  }
  return {
    targetSpeedMps: null,
    targetPaceSeconds: durationSeconds / (distanceMeters / METERS_PER_100M),
  };
}

function solveTriadField(
  discipline: PlanDiscipline,
  solveFor: TriadField,
  values: PlannedMetricsTriadValues
): PlannedMetricsTriadValues {
  if (solveFor === "duration") {
    if (!hasDistance(values) || !hasPace(discipline, values)) return values;
    const seconds = durationSecondsFromDistancePace(
      discipline,
      values.distanceMeters!,
      values
    );
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return values;
    return { ...values, durationMinutes: seconds / 60 };
  }

  if (solveFor === "distance") {
    if (!hasDuration(values) || !hasPace(discipline, values)) return values;
    const seconds = values.durationMinutes! * 60;
    const meters = distanceFromDurationPace(discipline, seconds, values);
    if (meters == null || !Number.isFinite(meters) || meters <= 0) return values;
    return { ...values, distanceMeters: meters };
  }

  if (!hasDuration(values) || !hasDistance(values)) return values;
  const seconds = values.durationMinutes! * 60;
  const pace = paceFromDurationDistance(discipline, seconds, values.distanceMeters!);
  if (!pace) return values;
  if (discipline === "BIKE") {
    return { ...values, targetSpeedMps: pace.targetSpeedMps, targetPaceSeconds: null };
  }
  return { ...values, targetPaceSeconds: pace.targetPaceSeconds, targetSpeedMps: null };
}

function pickSolveField(
  discipline: PlanDiscipline,
  edited: TriadField,
  values: PlannedMetricsTriadValues,
  autoField: TriadField | null
): TriadField | null {
  const filled = {
    duration: hasDuration(values),
    distance: hasDistance(values),
    pace: hasPace(discipline, values),
  };
  const count = [filled.duration, filled.distance, filled.pace].filter(Boolean).length;
  if (count < 2) return null;

  if (!filled.duration) return "duration";
  if (!filled.distance) return "distance";
  if (!filled.pace) return "pace";

  if (autoField && autoField !== edited) return autoField;
  if (edited === "duration" || edited === "distance") return "pace";
  return "duration";
}

function isFieldEmpty(
  discipline: PlanDiscipline,
  field: TriadField,
  values: PlannedMetricsTriadValues
): boolean {
  if (field === "duration") return !hasDuration(values);
  if (field === "distance") return !hasDistance(values);
  return !hasPace(discipline, values);
}

export function reconcilePlannedMetricsTriad(
  discipline: PlanDiscipline,
  edited: TriadField,
  values: PlannedMetricsTriadValues,
  autoField: TriadField | null
): { values: PlannedMetricsTriadValues; autoField: TriadField | null } {
  if (isFieldEmpty(discipline, edited, values)) {
    return {
      values,
      autoField: autoField === edited ? null : autoField,
    };
  }

  const solveFor = pickSolveField(discipline, edited, values, autoField);
  if (!solveFor) {
    return { values, autoField: edited === autoField ? null : autoField };
  }
  const solved = solveTriadField(discipline, solveFor, values);
  return { values: solved, autoField: solveFor };
}
