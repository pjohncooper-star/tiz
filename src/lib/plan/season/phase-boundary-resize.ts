/** Cumulative week index where each phase starts (aligned to sorted phase order). */
export function phaseStartWeekIndices(weekCounts: number[]): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const weeks of weekCounts) {
    starts.push(cursor);
    cursor += weeks;
  }
  return starts;
}

/**
 * Move the boundary between phase `boundaryIndex` and `boundaryIndex + 1` to
 * `boundaryWeekIndex` (cumulative weeks before the right phase). Keeps total
 * weeks constant; each adjacent phase stays at least 1 week.
 */
export function resizePhaseBoundaryAtWeek(
  weekCounts: number[],
  boundaryIndex: number,
  boundaryWeekIndex: number
): number[] | null {
  if (boundaryIndex < 0 || boundaryIndex >= weekCounts.length - 1) {
    return null;
  }

  const before = weekCounts.slice(0, boundaryIndex).reduce((sum, weeks) => sum + weeks, 0);
  const left = weekCounts[boundaryIndex] ?? 0;
  const right = weekCounts[boundaryIndex + 1] ?? 0;
  const minBoundary = before + 1;
  const maxBoundary = before + left + right - 1;
  const clamped = Math.max(minBoundary, Math.min(maxBoundary, Math.round(boundaryWeekIndex)));
  const newLeft = clamped - before;
  const newRight = left + right - newLeft;

  return weekCounts.map((weeks, index) => {
    if (index === boundaryIndex) return newLeft;
    if (index === boundaryIndex + 1) return newRight;
    return weeks;
  });
}
