import type { Discipline } from "@prisma/client";
import {
  formatChartPace,
  formatStreamDistance,
  formatStreamTime,
  speedUnitLabel,
} from "@/lib/activity/record-streams";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { formatPace, velocityToPaceSecPer100m } from "@/lib/units/pace";
import { resolveSampleDurations } from "@/lib/zones/sample-time";

const METERS_PER_MILE = 1609.344;
const METERS_PER_100YD = 91.44;
const MOVING_SPEED_THRESHOLD_MPS = 0.1;

export type SummaryStat = { label: string; value: string };

export type ActivitySummaryInput = {
  discipline: Discipline;
  durationSeconds: number;
  distanceMeters: number | null;
  streams: NormalizedStreams | null;
  displayUnit: "METRIC" | "IMPERIAL";
};

function weightedMean(
  values: number[] | undefined,
  weights: number[]
): number | null {
  if (!values?.length) return null;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i] ?? 0;
    if (v != null && v > 0 && w > 0) {
      sum += v * w;
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : null;
}

function distanceFromStreams(streams: NormalizedStreams | null): number | null {
  const series = streams?.distance?.data;
  if (!series?.length) return null;
  const max = Math.max(...series);
  return max > 0 ? max : null;
}

function movingSecondsFromSwimLaps(streams: NormalizedStreams): number | null {
  const laps = streams.swimLaps?.data;
  if (!laps?.length) return null;
  const active = laps.filter((l) => l.speedMps > 0);
  if (active.length === 0) return null;
  return active.reduce((sum, l) => sum + l.durationSec, 0);
}

function movingSecondsFromVelocity(
  streams: NormalizedStreams,
  elapsedSeconds: number
): number | null {
  const velocity = streams.velocity?.data;
  if (!velocity?.length) return null;
  const durations = resolveSampleDurations(streams, elapsedSeconds);
  let moving = 0;
  for (let i = 0; i < velocity.length; i++) {
    if ((velocity[i] ?? 0) > MOVING_SPEED_THRESHOLD_MPS) {
      moving += durations[i] ?? 0;
    }
  }
  return moving > 0 ? moving : null;
}

export function resolveActivityNumericMetrics(
  durationSeconds: number,
  distanceMeters: number | null,
  streams: NormalizedStreams | null
): {
  elapsedSeconds: number;
  movingSeconds: number | null;
  distanceMeters: number | null;
} {
  const elapsedSeconds = resolveElapsedSeconds(durationSeconds, streams);
  const movingSeconds = resolveMovingSeconds(elapsedSeconds, streams);
  const distance =
    distanceMeters != null && distanceMeters > 0
      ? distanceMeters
      : distanceFromStreams(streams);
  return { elapsedSeconds, movingSeconds, distanceMeters: distance };
}

function resolveElapsedSeconds(
  durationSeconds: number,
  streams: NormalizedStreams | null
): number {
  const meta = streams?.meta?.elapsedSeconds;
  if (meta != null && meta > 0) return Math.round(meta);
  return durationSeconds;
}

function resolveMovingSeconds(
  elapsedSeconds: number,
  streams: NormalizedStreams | null
): number | null {
  const meta = streams?.meta?.movingSeconds;
  if (meta != null && meta > 0) return Math.round(meta);

  if (!streams) return null;

  const fromSwim = movingSecondsFromSwimLaps(streams);
  if (fromSwim != null) return Math.round(fromSwim);

  const fromVelocity = movingSecondsFromVelocity(streams, elapsedSeconds);
  if (fromVelocity != null) return Math.round(fromVelocity);

  return null;
}

function formatSpeedFromMps(
  mps: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (displayUnit === "METRIC") {
    return `${(mps * 3.6).toFixed(1)} ${speedUnitLabel(displayUnit)}`;
  }
  return `${(mps * 2.2369362921).toFixed(1)} ${speedUnitLabel(displayUnit)}`;
}

function formatRunPace(
  distanceM: number,
  movingSec: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string | null {
  if (distanceM <= 0 || movingSec <= 0) return null;
  const secPerKm = (movingSec / distanceM) * 1000;
  if (displayUnit === "METRIC") {
    return `${formatChartPace(secPerKm, displayUnit)} /km`;
  }
  const secPerMi = secPerKm * (METERS_PER_MILE / 1000);
  return `${formatChartPace(secPerMi, displayUnit)} /mi`;
}

function formatSwimPace(
  distanceM: number,
  movingSec: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string | null {
  if (distanceM <= 0 || movingSec <= 0) return null;
  const mps = distanceM / movingSec;
  const secPer100m = velocityToPaceSecPer100m(mps);
  if (!secPer100m) return null;
  if (displayUnit === "METRIC") {
    return `${formatPace(secPer100m, "100m")} /100m`;
  }
  const secPer100yd = secPer100m * (METERS_PER_100YD / 100);
  return `${formatPace(secPer100yd, "100yd")} /100yd`;
}

function addTimeStats(
  stats: SummaryStat[],
  elapsedSec: number,
  movingSec: number | null
) {
  const showBoth =
    movingSec != null && Math.abs(elapsedSec - movingSec) >= 5;

  if (showBoth && movingSec != null) {
    stats.push(
      { label: "Elapsed", value: formatStreamTime(elapsedSec) },
      { label: "Moving", value: formatStreamTime(movingSec) }
    );
    return movingSec;
  }

  stats.push({ label: "Duration", value: formatStreamTime(elapsedSec) });
  return elapsedSec;
}

export function computeActivitySummary(input: ActivitySummaryInput): SummaryStat[] {
  const { discipline, durationSeconds, distanceMeters, streams, displayUnit } =
    input;
  const stats: SummaryStat[] = [];

  const elapsedSec = resolveElapsedSeconds(durationSeconds, streams);
  const movingSec = resolveMovingSeconds(elapsedSec, streams);
  const paceTimeSec = movingSec ?? elapsedSec;

  addTimeStats(stats, elapsedSec, movingSec);

  const distanceM =
    distanceMeters != null && distanceMeters > 0
      ? distanceMeters
      : distanceFromStreams(streams);
  if (distanceM != null && distanceM > 0) {
    stats.push({
      label: "Distance",
      value: formatStreamDistance(distanceM, displayUnit),
    });
  }

  const meta = streams?.meta;
  const durations = streams
    ? resolveSampleDurations(streams, elapsedSec)
    : [];

  if (discipline === "BIKE") {
    const avgSpeedMps =
      meta?.avgSpeedMps && meta.avgSpeedMps > 0
        ? meta.avgSpeedMps
        : distanceM && paceTimeSec > 0
          ? distanceM / paceTimeSec
          : null;
    if (avgSpeedMps != null) {
      stats.push({
        label: "Avg speed",
        value: formatSpeedFromMps(avgSpeedMps, displayUnit),
      });
    }

    const avgPower =
      meta?.avgPower && meta.avgPower > 0
        ? meta.avgPower
        : weightedMean(streams?.watts?.data, durations);
    if (avgPower != null) {
      stats.push({
        label: "Avg power",
        value: `${Math.round(avgPower)} W`,
      });
    }

    const avgCadence =
      meta?.avgCadence && meta.avgCadence > 0
        ? meta.avgCadence
        : weightedMean(streams?.cadence?.data, durations);
    if (avgCadence != null) {
      stats.push({
        label: "Avg cadence",
        value: `${Math.round(avgCadence)} rpm`,
      });
    }
  }

  if (discipline === "RUN") {
    const avgPace =
      distanceM && paceTimeSec > 0
        ? formatRunPace(distanceM, paceTimeSec, displayUnit)
        : null;
    if (avgPace) {
      stats.push({ label: "Avg pace", value: avgPace });
    }

    const avgCadence =
      meta?.avgCadence && meta.avgCadence > 0
        ? meta.avgCadence
        : weightedMean(streams?.cadence?.data, durations);
    if (avgCadence != null) {
      stats.push({
        label: "Avg cadence",
        value: `${Math.round(avgCadence)} spm`,
      });
    }
  }

  if (discipline === "SWIM") {
    const laps = streams?.swimLaps?.data;
    if (laps?.length) {
      const restSec = laps
        .filter((l) => l.speedMps <= 0)
        .reduce((sum, l) => sum + l.durationSec, 0);
      if (restSec >= 5) {
        stats.push({
          label: "Rest",
          value: formatStreamTime(Math.round(restSec)),
        });
      }
    }

    const avgPace =
      distanceM && paceTimeSec > 0
        ? formatSwimPace(distanceM, paceTimeSec, displayUnit)
        : null;
    if (avgPace) {
      stats.push({ label: "Avg pace", value: avgPace });
    }
  }

  const avgHr =
    meta?.avgHeartRate && meta.avgHeartRate > 0
      ? meta.avgHeartRate
      : weightedMean(streams?.heartrate?.data, durations);
  if (avgHr != null) {
    stats.push({
      label: "Avg heart rate",
      value: `${Math.round(avgHr)} bpm`,
    });
  }

  return stats;
}
