import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { zonePctRanges } from "@/lib/zones/display";

/** Fixed Z5 working intensity as % of threshold speed. */
export const Z5_SPEED_PCT = 120;

/**
 * Intensity (% of threshold speed) at the planning midpoint of a pace zone.
 * Z1: mirror adjacent (Z2) width; Z2–Z4: true mid; Z5: fixed 120%.
 */
export function zoneMidSpeedPct(zone: number, boundaries: number[]): number {
  const z = Math.max(1, Math.min(5, Math.round(zone)));
  if (z === 5) return Z5_SPEED_PCT;

  const sorted = [...boundaries].filter((b) => Number.isFinite(b) && b > 0).sort((a, b) => a - b);
  if (sorted.length < 2) return 100;

  if (z === 1) {
    const z1Top = sorted[0]!;
    const z2Top = sorted[1]!;
    const z2Width = z2Top - z1Top;
    const floor = z1Top - z2Width;
    return (floor + z1Top) / 2;
  }

  const ranges = zonePctRanges("PACE", sorted, 5);
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
