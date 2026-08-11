import type { Discipline } from "@prisma/client";
import { clampZone, type ZoneNumber } from "@/lib/zones/model";

/** Garmin FIT custom targets use targetValue=0; watts/bpm use field offsets. */
export const POWER_WATTS_OFFSET = 1000;
export const HEART_RATE_BPM_OFFSET = 100;
export const SPEED_SCALE = 1000;

export type FitExportThresholds = {
  ftpWatts?: number;
  maxHeartRateBpm?: number;
  thresholdPaceSecondsPerKm?: number;
};

/**
 * Garmin target intensity per zone, as a percentage of FTP / max HR.
 *
 * These are the floor of each zone rather than its midpoint, and they are fixed
 * rather than derived from the athlete's own cutoffs. Deriving them would change
 * the intensity every exported workout asks for, so it is deliberately left alone
 * here.
 */
const PERCENT_FTP_BY_ZONE: Record<ZoneNumber, number> = {
  1: 50,
  2: 65,
  3: 75,
  4: 90,
  5: 105,
};

const PERCENT_MAX_HR_BY_ZONE: Record<ZoneNumber, number> = {
  1: 60,
  2: 70,
  3: 80,
  4: 88,
  5: 95,
};

export function zoneToPercentFtp(zone: number): number {
  return PERCENT_FTP_BY_ZONE[clampZone(zone)];
}

export function zoneToPercentMaxHr(zone: number): number {
  return PERCENT_MAX_HR_BY_ZONE[clampZone(zone)];
}

export function encodeFitPowerPercent(percentFtp: number): number {
  return Math.max(0, Math.round(percentFtp));
}

export function encodeFitPowerWatts(watts: number): number {
  return POWER_WATTS_OFFSET + Math.round(watts);
}

export function encodeFitPower(
  watts: number,
  thresholds: FitExportThresholds
): number {
  if (thresholds.ftpWatts && thresholds.ftpWatts > 0) {
    return encodeFitPowerPercent((watts / thresholds.ftpWatts) * 100);
  }
  return encodeFitPowerWatts(watts);
}

export function encodeFitHeartRatePercent(percent: number): number {
  return Math.max(0, Math.round(percent));
}

export function encodeFitHeartRateBpm(bpm: number): number {
  return HEART_RATE_BPM_OFFSET + Math.round(bpm);
}

export function encodeFitHeartRate(
  bpm: number,
  thresholds: FitExportThresholds
): number {
  if (thresholds.maxHeartRateBpm && thresholds.maxHeartRateBpm > 0) {
    return encodeFitHeartRatePercent((bpm / thresholds.maxHeartRateBpm) * 100);
  }
  return encodeFitHeartRateBpm(bpm);
}

/** Canonical pace: sec/km (run) or sec/100m (swim). */
export function paceSecondsToMps(
  paceSeconds: number,
  discipline: Discipline
): number {
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return 0;
  if (discipline === "SWIM") return 100 / paceSeconds;
  return 1000 / paceSeconds;
}

export function encodeFitSpeedMps(mps: number): number {
  return Math.round(mps * SPEED_SCALE);
}

export function zoneToSpeedEncoded(
  zone: number,
  discipline: Discipline,
  thresholds: FitExportThresholds
): number {
  const pct = zoneToPercentFtp(zone) / 100;
  const basePace =
    thresholds.thresholdPaceSecondsPerKm ??
    (discipline === "SWIM" ? 120 : 300);
  const mps = paceSecondsToMps(basePace, discipline) * pct;
  return encodeFitSpeedMps(mps);
}
