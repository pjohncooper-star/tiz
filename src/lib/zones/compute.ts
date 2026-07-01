import type {
  AthleteDisciplineSettings,
  Discipline,
  SignalType,
  ThresholdProfile,
} from "@prisma/client";
import type { SwimLapPoint } from "@/lib/import/swim-laps";
import { velocityToPaceSecPer100m, velocityToPaceSecPerKm } from "@/lib/units/pace";
import { resolveSampleDurations } from "./sample-time";
import { parseZoneBoundaries } from "./thresholds";

export type StreamSeries = { data: number[] };

/** Session-level stats from FIT/TCX when available (preferred over stream estimates). */
export type ActivitySessionMeta = {
  elapsedSeconds?: number;
  movingSeconds?: number;
  avgSpeedMps?: number;
  avgPower?: number;
  avgHeartRate?: number;
  avgCadence?: number;
  /** Garmin post-workout feel, 0–100. */
  workoutFeel?: number;
  /** Garmin RPE × 10 (10 = 1/10). */
  workoutRpe?: number;
};

export type WorkoutExecutionLap = {
  elapsedSeconds: number;
  movingSeconds?: number;
  wktStepIndex?: number;
  lapTrigger?: string;
};

export type NormalizedStreams = {
  time?: StreamSeries;
  /** Elapsed seconds at end of each velocity sample (pool swim lengths). */
  velocityTime?: StreamSeries;
  /** Per-lap swim timeline (charts + pace zone calculation). */
  swimLaps?: { data: SwimLapPoint[] };
  /** Workout step alignment from device laps (Garmin wktStepIndex). */
  workoutLaps?: { data: WorkoutExecutionLap[] };
  watts?: StreamSeries;
  heartrate?: StreamSeries;
  velocity?: StreamSeries;
  /** Cumulative distance in meters at each record sample. */
  distance?: StreamSeries;
  /** Cadence in rpm at each record sample. */
  cadence?: StreamSeries;
  meta?: ActivitySessionMeta;
};

export type ZoneMinutes = Record<number, number>;

const USABILITY = 0.8;

function usable(data: number[] | undefined, min = 10): boolean {
  if (!data || data.length < min) return false;
  const valid = data.filter((v) => v != null && !Number.isNaN(v) && v > 0).length;
  return valid / data.length >= USABILITY;
}

export function isStreamUsable(
  streams: NormalizedStreams,
  signal: SignalType
): boolean {
  if (signal === "POWER") return usable(streams.watts?.data);
  if (signal === "HEART_RATE") return usable(streams.heartrate?.data);
  if (signal === "PACE" && streams.swimLaps?.data?.length) {
    const active = streams.swimLaps.data.filter((l) => l.speedMps > 0);
    return active.length >= 3;
  }
  return usable(streams.velocity?.data);
}

function sampleValue(
  streams: NormalizedStreams,
  signal: SignalType,
  discipline: Discipline,
  i: number
): number | null {
  if (signal === "POWER") {
    const v = streams.watts?.data[i];
    return v != null && v > 0 ? v : null;
  }
  if (signal === "HEART_RATE") {
    const v = streams.heartrate?.data[i];
    return v != null && v > 0 ? v : null;
  }
  const vel = streams.velocity?.data[i];
  if (vel == null || vel <= 0) return null;
  return discipline === "SWIM"
    ? velocityToPaceSecPer100m(vel)
    : velocityToPaceSecPerKm(vel);
}

function assignZone(
  value: number,
  threshold: number,
  boundaries: number[],
  signal: SignalType
): number {
  const pct =
    signal === "PACE" ? (threshold / value) * 100 : (value / threshold) * 100;

  if (signal === "PACE") {
    const sorted = [...boundaries].sort((a, b) => a - b);
    let zone = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (pct >= sorted[i]) zone = i + 2;
    }
    return Math.min(zone, sorted.length + 1);
  }

  for (let i = 0; i < boundaries.length; i++) {
    if (pct <= boundaries[i]) return i + 1;
  }
  return boundaries.length + 1;
}

export function computeZoneBreakdown(
  streams: NormalizedStreams,
  profile: ThresholdProfile,
  discipline: Discipline,
  durationSeconds?: number
): ZoneMinutes {
  const boundaries = parseZoneBoundaries(profile.zoneBoundaries);
  const signal = profile.signalType;
  const length = Math.max(
    signal === "POWER"
      ? (streams.watts?.data.length ?? 0)
      : signal === "HEART_RATE"
        ? (streams.heartrate?.data.length ?? 0)
        : (streams.velocity?.data.length ?? 0),
    streams.time?.data.length ?? 0,
    streams.velocityTime?.data.length ?? 0
  );

  const sampleDurations = resolveSampleDurations(
    streams,
    durationSeconds,
    signal
  );

  const zoneMinutes: ZoneMinutes = {};
  for (let z = 1; z <= profile.zoneCount; z++) zoneMinutes[z] = 0;

  for (let i = 0; i < length; i++) {
    const value = sampleValue(streams, signal, discipline, i);
    if (value == null) continue;
    const zone = assignZone(value, profile.thresholdValue, boundaries, signal);
    const clamped = Math.min(Math.max(zone, 1), profile.zoneCount);
    const dt = sampleDurations[i] ?? 1;
    zoneMinutes[clamped] = (zoneMinutes[clamped] ?? 0) + dt / 60;
  }

  if (
    discipline === "SWIM" &&
    signal === "PACE" &&
    streams.swimLaps?.data?.length
  ) {
    for (const lap of streams.swimLaps.data) {
      if (lap.speedMps <= 0 && lap.durationSec > 0) {
        zoneMinutes[1] = (zoneMinutes[1] ?? 0) + lap.durationSec / 60;
      }
    }
  }

  return zoneMinutes;
}

export function resolveCanonicalSignal(
  settings: Pick<AthleteDisciplineSettings, "primarySignal" | "fallbackSignal">,
  streams: NormalizedStreams
): { signal: SignalType; usedFallback: boolean } | null {
  if (isStreamUsable(streams, settings.primarySignal)) {
    return { signal: settings.primarySignal, usedFallback: false };
  }
  if (settings.fallbackSignal && isStreamUsable(streams, settings.fallbackSignal)) {
    return { signal: settings.fallbackSignal, usedFallback: true };
  }
  return null;
}
