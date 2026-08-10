import type { StepTarget, TargetSignal, TargetUnit } from "@/lib/workout/workout-tree";

/**
 * Athlete thresholds a percent target resolves against. Pace is the threshold
 * pace for the workout's own discipline (run km / swim 100m).
 */
export type TargetThresholds = {
  ftpWatts?: number | null;
  thresholdPaceSeconds?: number | null;
  thresholdHrBpm?: number | null;
};

/** Signals whose absolute values can be expressed as % of a threshold. */
export function signalSupportsPercent(signal: TargetSignal): boolean {
  return signal === "power" || signal === "pace" || signal === "heart_rate";
}

export function thresholdForSignal(
  signal: TargetSignal,
  thresholds: TargetThresholds
): number | null {
  const value =
    signal === "power"
      ? thresholds.ftpWatts
      : signal === "pace"
        ? thresholds.thresholdPaceSeconds
        : signal === "heart_rate"
          ? thresholds.thresholdHrBpm
          : null;
  return value != null && value > 0 ? value : null;
}

/**
 * Absolute value → % of threshold.
 * Pace is expressed as % of threshold *speed* (higher = faster = harder), which
 * matches the zone boundary convention in `@/lib/zones/boundaries`.
 */
export function percentFromAbsolute(
  signal: TargetSignal,
  absolute: number,
  threshold: number
): number | null {
  if (!(absolute > 0) || !(threshold > 0)) return null;
  const pct = signal === "pace" ? (threshold / absolute) * 100 : (absolute / threshold) * 100;
  return Math.round(pct * 10) / 10;
}

/** % of threshold → absolute watts / pace seconds / bpm. */
export function absoluteFromPercent(
  signal: TargetSignal,
  percent: number,
  threshold: number
): number | null {
  if (!(percent > 0) || !(threshold > 0)) return null;
  const absolute =
    signal === "pace" ? (threshold * 100) / percent : (threshold * percent) / 100;
  return Math.round(absolute);
}

export function isPercentTarget(
  target: Pick<StepTarget, "signal" | "unit">
): boolean {
  return target.unit === "percent" && signalSupportsPercent(target.signal);
}

function midpoint(target: Pick<StepTarget, "mode" | "value" | "low" | "high">): number | null {
  if (target.mode === "value" && target.value != null) return target.value;
  if (target.mode === "range" && target.low != null && target.high != null) {
    return (target.low + target.high) / 2;
  }
  return null;
}

/** Midpoint of a percent-unit target, or null when the target is not percent. */
export function percentMidpoint(target: StepTarget): number | null {
  if (!isPercentTarget(target)) return null;
  return midpoint(target);
}

/**
 * Midpoint as % of threshold regardless of how the target is stored.
 * Absolute targets need the matching threshold to convert; returns null without one.
 */
export function targetPercent(
  target: StepTarget,
  thresholds: TargetThresholds
): number | null {
  if (target.mode === "zone") return null;
  const mid = midpoint(target);
  if (mid == null) return null;
  if (isPercentTarget(target)) return mid;
  const threshold = thresholdForSignal(target.signal, thresholds);
  if (threshold == null) return null;
  return percentFromAbsolute(target.signal, mid, threshold);
}

export type ResolvedTargetValues = {
  value?: number;
  low?: number;
  high?: number;
};

/**
 * `value`/`low`/`high` in native units (watts, pace seconds, bpm).
 * Absolute targets pass through; percent targets resolve against `thresholds`
 * and are returned unchanged when the matching threshold is unknown.
 */
export function resolveTargetValues(
  target: StepTarget,
  thresholds: TargetThresholds
): ResolvedTargetValues {
  const raw: ResolvedTargetValues = {
    ...(target.value != null ? { value: target.value } : {}),
    ...(target.low != null ? { low: target.low } : {}),
    ...(target.high != null ? { high: target.high } : {}),
  };
  if (!isPercentTarget(target)) return raw;
  const threshold = thresholdForSignal(target.signal, thresholds);
  if (threshold == null) return raw;
  const convert = (v: number) =>
    absoluteFromPercent(target.signal, v, threshold) ?? v;
  return {
    ...(raw.value != null ? { value: convert(raw.value) } : {}),
    ...(raw.low != null ? { low: convert(raw.low) } : {}),
    ...(raw.high != null ? { high: convert(raw.high) } : {}),
  };
}

/** Same as `resolveTargetValues` but for the low/high pair on a ramp target. */
export function resolveRampValues(
  target: { signal: Exclude<TargetSignal, "open">; low: number; high: number; unit?: TargetUnit },
  thresholds: TargetThresholds
): { low: number; high: number } {
  if (target.unit !== "percent" || !signalSupportsPercent(target.signal)) {
    return { low: target.low, high: target.high };
  }
  const threshold = thresholdForSignal(target.signal, thresholds);
  if (threshold == null) return { low: target.low, high: target.high };
  return {
    low: absoluteFromPercent(target.signal, target.low, threshold) ?? target.low,
    high: absoluteFromPercent(target.signal, target.high, threshold) ?? target.high,
  };
}

/** Resolved midpoint in native units, or null when unavailable. */
export function resolveTargetMidpoint(
  target: StepTarget,
  thresholds: TargetThresholds
): number | null {
  const resolved = resolveTargetValues(target, thresholds);
  return midpoint({ mode: target.mode, ...resolved });
}
