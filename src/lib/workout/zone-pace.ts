import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { zonePctRanges, type ZoneRange } from "@/lib/zones/display";

function zoneMidPct(range: ZoneRange): number {
  if (range.minPct != null && range.maxPct != null) {
    return (range.minPct + range.maxPct) / 2;
  }
  if (range.maxPct != null) return (range.maxPct + 100) / 2;
  if (range.minPct != null) return (range.minPct + 120) / 2;
  return 100;
}

/** Pace zones use % of threshold speed; higher % = faster (fewer seconds). */
export function paceSecondsAtZoneMidpoint(
  zone: number,
  thresholdPaceSeconds: number,
  boundaries: number[] = zoneBoundariesFor("RUN", "PACE")
): number {
  if (!Number.isFinite(thresholdPaceSeconds) || thresholdPaceSeconds <= 0) return 0;
  const z = Math.max(1, Math.min(5, Math.round(zone)));
  const ranges = zonePctRanges("PACE", boundaries, 5);
  const range = ranges.find((r) => r.zone === z);
  if (!range) return thresholdPaceSeconds;
  const pct = zoneMidPct(range);
  if (pct <= 0) return thresholdPaceSeconds;
  return (thresholdPaceSeconds * 100) / pct;
}
