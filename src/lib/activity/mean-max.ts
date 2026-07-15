/**
 * Mean-max (mean maximal) duration curves from irregular samples.
 * Sliding window maximizes the duration-weighted average over each target window.
 */

export const MEAN_MAX_WINDOWS_SEC = [
  5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 2700, 3600, 5400, 7200, 10800,
] as const;

export type MeanMaxPoint = {
  durationSec: number;
  value: number;
};

/**
 * Best (highest) duration-weighted mean for each window length.
 * Values at indices with non-positive duration or non-finite value are skipped.
 */
export function meanMaxBest(
  values: Array<number | null | undefined>,
  sampleDurationsSec: number[],
  windowsSec: readonly number[] = MEAN_MAX_WINDOWS_SEC
): MeanMaxPoint[] {
  return meanMax(values, sampleDurationsSec, windowsSec, "max");
}

/**
 * Best (lowest) duration-weighted mean for each window — e.g. pace as sec/km.
 */
export function meanMaxBestLow(
  values: Array<number | null | undefined>,
  sampleDurationsSec: number[],
  windowsSec: readonly number[] = MEAN_MAX_WINDOWS_SEC
): MeanMaxPoint[] {
  return meanMax(values, sampleDurationsSec, windowsSec, "min");
}

function meanMax(
  values: Array<number | null | undefined>,
  sampleDurationsSec: number[],
  windowsSec: readonly number[],
  mode: "max" | "min"
): MeanMaxPoint[] {
  const n = Math.min(values.length, sampleDurationsSec.length);
  if (n === 0) return [];

  const cleaned: Array<{ v: number; d: number }> = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const d = sampleDurationsSec[i];
    if (v == null || !Number.isFinite(v) || !(d > 0) || !Number.isFinite(d)) continue;
    cleaned.push({ v, d });
  }
  if (cleaned.length === 0) return [];

  const totalDuration = cleaned.reduce((s, c) => s + c.d, 0);
  const points: MeanMaxPoint[] = [];

  for (const windowSec of windowsSec) {
    if (!(windowSec > 0) || windowSec > totalDuration + 1e-6) continue;
    const best = bestWindowMean(cleaned, windowSec, mode);
    if (best != null && Number.isFinite(best)) {
      points.push({ durationSec: windowSec, value: best });
    }
  }
  return points;
}

function bestWindowMean(
  samples: Array<{ v: number; d: number }>,
  windowSec: number,
  mode: "max" | "min"
): number | null {
  let best: number | null = null;
  let left = 0;
  let sumVD = 0;
  let sumD = 0;

  for (let right = 0; right < samples.length; right++) {
    sumVD += samples[right].v * samples[right].d;
    sumD += samples[right].d;

    while (left <= right && sumD - samples[left].d >= windowSec - 1e-9) {
      sumVD -= samples[left].v * samples[left].d;
      sumD -= samples[left].d;
      left += 1;
    }

    if (sumD + 1e-9 >= windowSec && sumD > 0) {
      // If window overshoots, blend the left edge proportionally.
      let adjSumVD = sumVD;
      let adjSumD = sumD;
      if (sumD > windowSec + 1e-9 && left <= right) {
        const excess = sumD - windowSec;
        const edge = samples[left];
        if (edge.d > 0 && excess < edge.d) {
          const keep = edge.d - excess;
          adjSumVD = sumVD - edge.v * excess;
          adjSumD = windowSec;
          // When keep unused: keep is the remaining edge duration after trim.
          void keep;
        }
      }
      if (adjSumD > 0) {
        const mean = adjSumVD / adjSumD;
        if (best == null) best = mean;
        else if (mode === "max" && mean > best) best = mean;
        else if (mode === "min" && mean < best) best = mean;
      }
    }
  }

  return best;
}

/** Merge multiple activities by taking the best value at each duration. */
export function mergeMeanMaxCurves(
  curves: MeanMaxPoint[][],
  mode: "max" | "min" = "max"
): MeanMaxPoint[] {
  const byDuration = new Map<number, number>();
  for (const curve of curves) {
    for (const point of curve) {
      const prev = byDuration.get(point.durationSec);
      if (prev == null) {
        byDuration.set(point.durationSec, point.value);
      } else if (mode === "max" && point.value > prev) {
        byDuration.set(point.durationSec, point.value);
      } else if (mode === "min" && point.value < prev) {
        byDuration.set(point.durationSec, point.value);
      }
    }
  }
  return [...byDuration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([durationSec, value]) => ({ durationSec, value }));
}

export function formatDurationWindow(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) {
    const m = sec / 60;
    return m >= 60 ? `${m / 60}h` : `${m}m`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s}s`;
}
