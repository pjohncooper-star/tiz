import type { NormalizedStreams } from "./compute";
import type { SignalType } from "@prisma/client";

function streamLength(streams: NormalizedStreams): number {
  return Math.max(
    streams.time?.data.length ?? 0,
    streams.velocityTime?.data.length ?? 0,
    streams.watts?.data.length ?? 0,
    streams.heartrate?.data.length ?? 0,
    streams.velocity?.data.length ?? 0
  );
}

function timeSeriesForSignal(
  streams: NormalizedStreams,
  signal: SignalType
): number[] | undefined {
  if (signal === "PACE") {
    const vt = streams.velocityTime?.data;
    if (vt && vt.length > 0) return vt;
  }
  return streams.time?.data;
}

function lengthForSignal(streams: NormalizedStreams, signal: SignalType): number {
  if (signal === "POWER") return streams.watts?.data.length ?? 0;
  if (signal === "HEART_RATE") return streams.heartrate?.data.length ?? 0;
  return streams.velocity?.data.length ?? 0;
}

function isElapsedStartSeries(time: number[]): boolean {
  if (time.length < 3) return time[0] === 0;
  const d0 = time[1] - time[0];
  const d1 = time[2] - time[1];
  return time[0] === 0 && d0 > 0 && d1 > 0 && Math.abs(d0 - d1) < 0.05;
}

/** Per-sample duration in seconds for zone time accumulation. */
export function resolveSampleDurations(
  streams: NormalizedStreams,
  durationSeconds?: number,
  signal?: SignalType
): number[] {
  const length =
    signal != null ? lengthForSignal(streams, signal) : streamLength(streams);
  if (length === 0) return [];

  const time = signal != null ? timeSeriesForSignal(streams, signal) : streams.time?.data;

  if (time && time.length >= length && time.some((t, i) => i > 0 && t > time[i - 1])) {
    const durations = new Array<number>(length);
    if (isElapsedStartSeries(time)) {
      for (let i = 0; i < length; i++) {
        if (i < length - 1) {
          durations[i] = Math.max(time[i + 1] - time[i], 0);
        } else {
          const tail =
            durationSeconds && durationSeconds > 0
              ? durationSeconds - time[i]
              : time[i] - (time[i - 1] ?? 0);
          durations[i] = Math.max(tail, 0);
        }
      }
    } else {
      for (let i = 0; i < length; i++) {
        const prev = i > 0 ? time[i - 1] : 0;
        durations[i] = Math.max(time[i] - prev, 0);
      }
    }

    if (durationSeconds && durationSeconds > 0) {
      const sum = durations.reduce((s, d) => s + d, 0);
      if (sum > 0 && Math.abs(sum - durationSeconds) / durationSeconds > 0.05) {
        const scale = durationSeconds / sum;
        for (let i = 0; i < durations.length; i++) durations[i] *= scale;
      }
    }
    return durations;
  }

  const total = durationSeconds && durationSeconds > 0 ? durationSeconds : length;
  const dt = total / length;
  return Array.from({ length }, () => dt);
}

export function looksLikeCumulativeDistance(values: number[]): boolean {
  if (values.length < 10) return false;
  let increasing = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= values[i - 1]) increasing++;
  }
  return increasing / (values.length - 1) >= 0.95;
}

/** Convert cumulative distance + elapsed time into instantaneous speed (m/s). */
export function deriveVelocityFromDistance(
  distances: number[],
  elapsedSec: number[]
): number[] {
  const velocities: number[] = [];
  for (let i = 0; i < distances.length; i++) {
    if (i === 0) {
      velocities.push(0);
      continue;
    }
    const dt = Math.max(elapsedSec[i] - elapsedSec[i - 1], 0.001);
    const dd = distances[i] - distances[i - 1];
    velocities.push(dd > 0 ? dd / dt : 0);
  }
  return velocities;
}
