const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

export const DEFAULT_REFERENCE_PACE_SECONDS = {
  RUN: 300,
  SWIM: 90,
} as const;

export function durationFromDistancePace(
  discipline: "RUN" | "SWIM",
  distanceMeters: number,
  paceSeconds: number
): number {
  if (distanceMeters <= 0 || paceSeconds <= 0) return 0;
  if (discipline === "RUN") {
    return (distanceMeters / METERS_PER_KM) * paceSeconds;
  }
  return (distanceMeters / METERS_PER_100M) * paceSeconds;
}

export function hoursFromDistancePace(
  discipline: "RUN" | "SWIM",
  distanceMeters: number,
  paceSeconds: number
): number {
  return Math.round((durationFromDistancePace(discipline, distanceMeters, paceSeconds) / 3600) * 10) / 10;
}

export function distanceFromDurationPace(
  discipline: "RUN" | "SWIM",
  durationSeconds: number,
  paceSeconds: number
): number {
  if (durationSeconds <= 0 || paceSeconds <= 0) return 0;
  if (discipline === "RUN") {
    return (durationSeconds / paceSeconds) * METERS_PER_KM;
  }
  return (durationSeconds / paceSeconds) * METERS_PER_100M;
}

export function distanceMetersFromHoursPace(
  discipline: "RUN" | "SWIM",
  hours: number,
  paceSeconds: number
): number {
  return distanceFromDurationPace(discipline, hours * 3600, paceSeconds);
}
