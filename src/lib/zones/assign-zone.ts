import type { SignalType } from "@prisma/client";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";

/** Fallback FTP when athlete has no POWER threshold (matches workout-profile). */
export const FALLBACK_FTP_WATTS = 200;

/**
 * Map a % of threshold into a zone index using the same rules as activity scoring.
 * POWER/HR: higher % → higher zone. PACE: higher % of threshold speed → higher zone.
 */
export function assignZoneFromPercent(
  pct: number,
  boundaries: number[],
  signal: SignalType
): number {
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

export type PowerZoneOptions = {
  thresholdFtpWatts?: number | null;
  powerZoneBoundaries?: number[];
  /** Clamp to this many zones (Week TiZ uses 1–5). */
  zoneCount?: number;
};

/** Map absolute watts to a bike power zone via FTP % boundaries. */
export function zoneFromPowerWatts(
  watts: number,
  options: PowerZoneOptions = {}
): number {
  if (!(watts > 0)) return 2;
  const ftp =
    options.thresholdFtpWatts != null && options.thresholdFtpWatts > 0
      ? options.thresholdFtpWatts
      : FALLBACK_FTP_WATTS;
  const boundaries =
    options.powerZoneBoundaries ?? zoneBoundariesFor("BIKE", "POWER");
  const zoneCount = options.zoneCount ?? boundaries.length + 1;
  const pct = (watts / ftp) * 100;
  const zone = assignZoneFromPercent(pct, boundaries, "POWER");
  return Math.min(Math.max(zone, 1), zoneCount);
}
