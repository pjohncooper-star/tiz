/** Percent of `whole` that `part` represents, or null when there is no baseline. */
export function percentOf(part: number, whole: number): number | null {
  if (!(whole > 0) || !Number.isFinite(part)) return null;
  return (part / whole) * 100;
}

/** Minutes of overlap between target and actual per zone: sum of min(actual, target). */
export function zoneOverlapMinutes(target: number[], actual: number[]): number {
  let overlap = 0;
  for (let i = 0; i < target.length; i++) {
    const t = target[i] ?? 0;
    const a = actual[i] ?? 0;
    if (t > 0 && a > 0) overlap += Math.min(t, a);
  }
  return overlap;
}

export function zoneTargetTotal(target: number[]): number {
  return target.reduce((sum, minutes) => sum + (minutes > 0 ? minutes : 0), 0);
}

/**
 * Zone match score: share of the zone-minute target that was actually covered in the
 * right zones. Bounded 0-100; null when there is no zone target.
 */
export function zoneOverlapPercent(target: number[], actual: number[]): number | null {
  return percentOf(zoneOverlapMinutes(target, actual), zoneTargetTotal(target));
}

/** actual - target per zone (positive = more than planned). */
export function zoneDeltas(target: number[], actual: number[]): number[] {
  return target.map((t, i) => (actual[i] ?? 0) - t);
}

export function addZoneArrays(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}
