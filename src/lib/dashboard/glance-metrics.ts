import type { NormalizedStreams } from "@/lib/zones/compute";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { resolveSampleDurations } from "@/lib/zones/sample-time";
import { normalizeStreamsForZones } from "@/lib/zones/normalize-streams";
import { velocityToPaceSecPerKm } from "@/lib/units/pace";
import {
  meanMaxBest,
  meanMaxBestLow,
  mergeMeanMaxCurves,
  type MeanMaxPoint,
} from "@/lib/activity/mean-max";
import { mondayWeekStartKey } from "@/lib/dates";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";

export type DurationCurveKind = "power" | "run_pace";

export type ActivityForCurves = {
  discipline: string;
  durationSeconds: number;
  rawStreams: unknown;
};

export type ActivityForVolume = {
  startTime: Date;
  utcOffsetSeconds?: number | null;
  discipline: string;
  durationSeconds: number;
  zoneBreakdowns: Array<{ zone: number; minutes: number; isCanonical: boolean }>;
};

export function computePowerDurationCurve(activities: ActivityForCurves[]): {
  points: MeanMaxPoint[];
  activityCount: number;
} {
  const curves: MeanMaxPoint[][] = [];
  let activityCount = 0;
  for (const activity of activities) {
    if (activity.discipline !== "BIKE") continue;
    const streams = normalizeStreamsForZones(parseStoredStreams(activity.rawStreams));
    if (!streams.watts?.data?.length) continue;
    const durations = resolveSampleDurations(streams, activity.durationSeconds, "POWER");
    const curve = meanMaxBest(streams.watts.data, durations);
    if (curve.length === 0) continue;
    curves.push(curve);
    activityCount += 1;
  }
  return { points: mergeMeanMaxCurves(curves, "max"), activityCount };
}

export function computeRunPaceDurationCurve(activities: ActivityForCurves[]): {
  points: MeanMaxPoint[];
  activityCount: number;
} {
  const curves: MeanMaxPoint[][] = [];
  let activityCount = 0;
  for (const activity of activities) {
    if (activity.discipline !== "RUN") continue;
    const streams = normalizeStreamsForZones(parseStoredStreams(activity.rawStreams));
    if (!streams.velocity?.data?.length) continue;
    const durations = resolveSampleDurations(streams, activity.durationSeconds, "PACE");
    const paceValues = streams.velocity.data.map((mps) => {
      if (mps == null || !(mps > 0)) return null;
      return velocityToPaceSecPerKm(mps);
    });
    const curve = meanMaxBestLow(paceValues, durations);
    if (curve.length === 0) continue;
    curves.push(curve);
    activityCount += 1;
  }
  return { points: mergeMeanMaxCurves(curves, "min"), activityCount };
}

export type WeeklyVolumePoint = {
  weekStart: string;
  swimHours: number;
  bikeHours: number;
  runHours: number;
};

export type ZoneMixPoint = {
  zone: number;
  minutes: number;
};

function activityDayKey(startTime: Date, utcOffsetSeconds?: number | null): string {
  const offsetMs =
    utcOffsetSeconds != null && Number.isFinite(utcOffsetSeconds)
      ? utcOffsetSeconds * 1000
      : 0;
  return new Date(startTime.getTime() + offsetMs).toISOString().slice(0, 10);
}

export function computeWeeklyVolumeHours(activities: ActivityForVolume[]): WeeklyVolumePoint[] {
  const byWeek = new Map<string, { SWIM: number; BIKE: number; RUN: number }>();

  for (const activity of activities) {
    if (
      activity.discipline !== "SWIM" &&
      activity.discipline !== "BIKE" &&
      activity.discipline !== "RUN"
    ) {
      continue;
    }
    const day = activityDayKey(activity.startTime, activity.utcOffsetSeconds);
    const week = mondayWeekStartKey(day);
    const row = byWeek.get(week) ?? { SWIM: 0, BIKE: 0, RUN: 0 };

    let minutes = 0;
    for (const zb of activity.zoneBreakdowns) {
      if (zb.isCanonical && zb.minutes > 0) minutes += zb.minutes;
    }
    const hours =
      minutes > 0 ? minutes / 60 : activity.durationSeconds > 0 ? activity.durationSeconds / 3600 : 0;
    if (!(hours > 0)) continue;
    row[activity.discipline] += hours;
    byWeek.set(week, row);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, row]) => ({
      weekStart,
      swimHours: round2(row.SWIM),
      bikeHours: round2(row.BIKE),
      runHours: round2(row.RUN),
    }));
}

export function computeZoneMix(activities: ActivityForVolume[]): ZoneMixPoint[] {
  const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const activity of activities) {
    if (
      activity.discipline !== "SWIM" &&
      activity.discipline !== "BIKE" &&
      activity.discipline !== "RUN"
    ) {
      continue;
    }
    for (const zb of activity.zoneBreakdowns) {
      if (!zb.isCanonical || !(zb.minutes > 0)) continue;
      if (zb.zone < 1 || zb.zone > 5) continue;
      totals[zb.zone] += zb.minutes;
    }
  }
  return [1, 2, 3, 4, 5].map((zone) => ({
    zone,
    minutes: round2(totals[zone] ?? 0),
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Re-export helper for tests / callers building zone maps. */
export function zoneMinutesFromBreakdowns(
  discipline: string,
  breakdowns: Array<{ zone: number; minutes: number; isCanonical: boolean }>
): ZoneMinutes {
  const zoneMinutes: ZoneMinutes = {};
  for (const zb of breakdowns) {
    if (!zb.isCanonical || !(zb.minutes > 0)) continue;
    if (discipline !== "SWIM" && discipline !== "BIKE" && discipline !== "RUN") continue;
    const key = zoneKey(discipline as "SWIM" | "BIKE" | "RUN", zb.zone);
    zoneMinutes[key] = (zoneMinutes[key] ?? 0) + zb.minutes;
  }
  return zoneMinutes;
}

export type { MeanMaxPoint, NormalizedStreams };
