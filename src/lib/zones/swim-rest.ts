/** Display offset for rest bars on the swim lap pace chart (sec per 100m/yd). */
export const REST_PACE_OFFSET_SEC = 60;

/** Synthetic chart pace for rest laps: slower than the slowest active interval. */
export function restChartPaceSec(slowestDisplayPaceSec: number): number {
  if (slowestDisplayPaceSec > 0) {
    return slowestDisplayPaceSec + REST_PACE_OFFSET_SEC;
  }
  return 120;
}
