import type { SignalType } from "@prisma/client";
import { ECO_ZONE_COUNT } from "./scores";

/**
 * ECO 8-zone intensity cutoffs as % of threshold (higher = harder).
 * Seven ascending cutoffs divide eight zones (AeT → AnT → MAP → glycolytic).
 *
 * Derived as approximate fractions of FTP / LTHR / threshold-pace speed so ECO
 * can run alongside TiZ's existing 5-zone planning model without replacing it.
 */
export const ECO_BOUNDARY_PCT_BY_SIGNAL: Record<SignalType, number[]> = {
  // % of FTP
  POWER: [55, 70, 85, 95, 105, 120, 150],
  // % of LTHR
  HEART_RATE: [68, 78, 89, 97, 103, 108, 115],
  // % of threshold *speed* (pace inverted, consistent with TiZ PACE zones)
  // Threshold ≈ AnT (top of ECO zone 4).
  PACE: [70, 80, 90, 100, 105, 115, 130],
};

export function ecoBoundariesForSignal(signal: SignalType): number[] {
  return [...ECO_BOUNDARY_PCT_BY_SIGNAL[signal]];
}

export function assignEcoZone(
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
      if (pct >= sorted[i]!) zone = i + 2;
    }
    return Math.min(zone, ECO_ZONE_COUNT);
  }

  for (let i = 0; i < boundaries.length; i++) {
    if (pct <= boundaries[i]!) return i + 1;
  }
  return ECO_ZONE_COUNT;
}
