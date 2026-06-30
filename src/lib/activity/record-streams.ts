import type { Discipline } from "@prisma/client";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { normalizeStreamsForZones } from "@/lib/zones/normalize-streams";
import { formatPace, velocityToPaceSecPerKm } from "@/lib/units/pace";

const METERS_PER_MILE = 1609.344;
const MAX_CHART_POINTS = 720;

export type ActivityStreamPoint = {
  timeSec: number;
  distanceM: number;
  power: number | null;
  cadence: number | null;
  speed: number | null;
  /** Run pace in sec/km (metric) or sec/mi (imperial) for chart axis. */
  pace: number | null;
  heartRate: number | null;
};

export type BikeStreamMetrics = {
  power: boolean;
  cadence: boolean;
  speed: boolean;
  heartRate: boolean;
};

export type RunStreamMetrics = {
  pace: boolean;
  cadence: boolean;
  heartRate: boolean;
};

export type StreamMetrics = BikeStreamMetrics | RunStreamMetrics;

function seriesLength(streams: NormalizedStreams): number {
  return Math.max(
    streams.time?.data.length ?? 0,
    streams.watts?.data.length ?? 0,
    streams.cadence?.data.length ?? 0,
    streams.velocity?.data.length ?? 0,
    streams.distance?.data.length ?? 0,
    streams.heartrate?.data.length ?? 0
  );
}

function deriveDistanceMeters(
  timeSec: number[],
  velocityMps: number[]
): number[] {
  const distance: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < timeSec.length; i++) {
    if (i > 0) {
      const dt = Math.max(timeSec[i] - timeSec[i - 1], 0);
      const v = velocityMps[i] ?? velocityMps[i - 1] ?? 0;
      cumulative += v * dt;
    }
    distance.push(cumulative);
  }
  return distance;
}

function mpsToDisplaySpeed(
  mps: number,
  displayUnit: "METRIC" | "IMPERIAL"
): number {
  if (displayUnit === "METRIC") return mps * 3.6;
  return mps * 2.2369362921;
}

function mpsToDisplayPaceSec(
  mps: number,
  displayUnit: "METRIC" | "IMPERIAL"
): number {
  const secPerKm = velocityToPaceSecPerKm(mps)!;
  if (displayUnit === "METRIC") return secPerKm;
  return secPerKm * (METERS_PER_MILE / 1000);
}

function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const result: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

export function parseRecordStreamPoints(
  streams: NormalizedStreams | null | undefined,
  displayUnit: "METRIC" | "IMPERIAL",
  discipline: "BIKE" | "RUN",
  durationSeconds?: number
): ActivityStreamPoint[] | null {
  if (!streams) return null;

  const normalized = normalizeStreamsForZones(streams, durationSeconds);

  const length = seriesLength(normalized);
  if (length < 2) return null;

  let time = normalized.time?.data;
  if (!time || time.length < 2) {
    const dt =
      durationSeconds && durationSeconds > 0 ? durationSeconds / (length - 1) : 1;
    time = Array.from({ length }, (_, i) => i * dt);
  }
  const watts = normalized.watts?.data ?? [];
  const cadence = normalized.cadence?.data ?? [];
  const velocity = normalized.velocity?.data ?? [];
  const heartrate = normalized.heartrate?.data ?? [];
  const distanceSeries = normalized.distance?.data ?? [];
  const distanceM =
    distanceSeries.some((d) => d > 0)
      ? distanceSeries
      : velocity.some((v) => v > 0)
        ? deriveDistanceMeters(time, velocity)
        : [];

  const points: ActivityStreamPoint[] = [];
  for (let i = 0; i < length; i++) {
    const timeSec = time[i] ?? (i > 0 ? time[i - 1] : 0);
    const vel = velocity[i] != null && velocity[i] > 0 ? velocity[i] : null;
    const hr =
      heartrate[i] != null && heartrate[i] > 0 ? heartrate[i] : null;

    points.push({
      timeSec,
      distanceM: distanceM[i] ?? points[i - 1]?.distanceM ?? 0,
      power:
        discipline === "BIKE" && watts[i] != null && watts[i] > 0
          ? watts[i]
          : null,
      cadence: cadence[i] != null && cadence[i] > 0 ? cadence[i] : null,
      speed:
        discipline === "BIKE" && vel != null
          ? mpsToDisplaySpeed(vel, displayUnit)
          : null,
      pace:
        discipline === "RUN" && vel != null
          ? mpsToDisplayPaceSec(vel, displayUnit)
          : null,
      heartRate: hr,
    });
  }

  const sampled = downsample(points, MAX_CHART_POINTS);
  return sampled.length > 1 ? sampled : null;
}

export function recordStreamMetrics(
  points: ActivityStreamPoint[],
  discipline: "BIKE" | "RUN"
): StreamMetrics | null {
  if (discipline === "BIKE") {
    const metrics: BikeStreamMetrics = {
      power: points.some((p) => p.power != null && p.power > 0),
      cadence: points.some((p) => p.cadence != null && p.cadence > 0),
      speed: points.some((p) => p.speed != null && p.speed > 0),
      heartRate: points.some((p) => p.heartRate != null && p.heartRate > 0),
    };
    return metrics.power || metrics.cadence || metrics.speed || metrics.heartRate
      ? metrics
      : null;
  }

  const metrics: RunStreamMetrics = {
    pace: points.some((p) => p.pace != null && p.pace > 0),
    cadence: points.some((p) => p.cadence != null && p.cadence > 0),
    heartRate: points.some((p) => p.heartRate != null && p.heartRate > 0),
  };
  return metrics.pace || metrics.cadence || metrics.heartRate ? metrics : null;
}

export function hasRecordStreamChart(
  streams: NormalizedStreams | null | undefined,
  displayUnit: "METRIC" | "IMPERIAL",
  discipline: "BIKE" | "RUN",
  durationSeconds?: number
): boolean {
  const points = parseRecordStreamPoints(
    streams,
    displayUnit,
    discipline,
    durationSeconds
  );
  if (!points) return false;
  return recordStreamMetrics(points, discipline) != null;
}

export function formatStreamTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatStreamDistance(
  meters: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (displayUnit === "METRIC") {
    const km = meters / 1000;
    return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
  }
  const mi = meters / METERS_PER_MILE;
  return mi >= 10 ? `${mi.toFixed(0)} mi` : `${mi.toFixed(1)} mi`;
}

export function speedUnitLabel(displayUnit: "METRIC" | "IMPERIAL"): string {
  return displayUnit === "METRIC" ? "km/h" : "mph";
}

export function paceUnitLabel(displayUnit: "METRIC" | "IMPERIAL"): string {
  return displayUnit === "METRIC" ? "min/km" : "min/mi";
}

export function formatChartPace(
  secPerUnit: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (displayUnit === "METRIC") {
    return formatPace(secPerUnit, "km");
  }
  const mins = Math.floor(secPerUnit / 60);
  const secs = Math.round(secPerUnit % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function distanceUnitLabel(displayUnit: "METRIC" | "IMPERIAL"): string {
  return displayUnit === "METRIC" ? "km" : "mi";
}

export function distanceXValue(
  meters: number,
  displayUnit: "METRIC" | "IMPERIAL"
): number {
  return displayUnit === "METRIC"
    ? meters / 1000
    : meters / METERS_PER_MILE;
}

export type ChartDiscipline = Extract<Discipline, "BIKE" | "RUN">;

export function isChartDiscipline(d: Discipline): d is ChartDiscipline {
  return d === "BIKE" || d === "RUN";
}
