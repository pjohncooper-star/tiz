import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { zonePctRanges } from "@/lib/zones/display";
import { ZONE_COUNT, clampZone } from "@/lib/zones/model";

/** Fixed top-zone working intensity as % of threshold speed. */
export const Z5_SPEED_PCT = 120;

/**
 * Intensity (% of threshold speed) at the planning midpoint of a pace zone.
 * Z1 mirrors the adjacent zone's width and the top zone is open-ended, so both
 * are special-cased; the zones between them use their true midpoint.
 */
export function zoneMidSpeedPct(zone: number, boundaries: number[]): number {
  const z = clampZone(zone);
  if (z === ZONE_COUNT) return Z5_SPEED_PCT;

  const sorted = [...boundaries].filter((b) => Number.isFinite(b) && b > 0).sort((a, b) => a - b);
  if (sorted.length < 2) return 100;

  if (z === 1) {
    const z1Top = sorted[0]!;
    const z2Top = sorted[1]!;
    const z2Width = z2Top - z1Top;
    const floor = z1Top - z2Width;
    return (floor + z1Top) / 2;
  }

  const ranges = zonePctRanges("PACE", sorted, ZONE_COUNT);
  const range = ranges.find((r) => r.zone === z);
  if (range?.minPct != null && range.maxPct != null) {
    return (range.minPct + range.maxPct) / 2;
  }
  return 100;
}

/** Speed (m/s) at the planning midpoint of a pace zone (% of threshold speed). */
export function speedMpsAtZoneMidpoint(
  zone: number,
  thresholdSpeedMps: number,
  boundaries: number[] = zoneBoundariesFor("RUN", "PACE")
): number {
  if (!Number.isFinite(thresholdSpeedMps) || thresholdSpeedMps <= 0) return 0;
  return thresholdSpeedMps * (zoneMidSpeedPct(zone, boundaries) / 100);
}

/** Pace zones use % of threshold speed; higher % = faster (fewer seconds). */
export function paceSecondsAtZoneMidpoint(
  zone: number,
  thresholdPaceSeconds: number,
  boundaries: number[] = zoneBoundariesFor("RUN", "PACE")
): number {
  if (!Number.isFinite(thresholdPaceSeconds) || thresholdPaceSeconds <= 0) return 0;
  const pct = zoneMidSpeedPct(zone, boundaries);
  if (pct <= 0) return thresholdPaceSeconds;
  return (thresholdPaceSeconds * 100) / pct;
}
