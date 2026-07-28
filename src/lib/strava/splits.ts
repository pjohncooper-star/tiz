/** Strava km/mi split from DetailedActivity (`splits_metric` / `splits_standard`). */
export type StravaSplit = {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  split: number;
  average_speed?: number | null;
  average_grade_adjusted_speed?: number | null;
  elevation_difference?: number | null;
  average_heartrate?: number | null;
  pace_zone?: number | null;
};

export type RunSplitUnit = "metric" | "standard";

/** Persisted run split with grade-adjusted speed (Strava GAP as m/s). */
export type RunSplitPoint = {
  split: number;
  distanceMeters: number;
  elapsedTimeSec: number;
  movingTimeSec: number;
  averageSpeedMps: number | null;
  /** Grade-adjusted average speed (m/s); invert for GAP pace. */
  averageGradeAdjustedSpeedMps: number | null;
  elevationDifferenceMeters: number | null;
  unit: RunSplitUnit;
};

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function mapStravaSplitsToRunSplits(
  splits: StravaSplit[],
  unit: RunSplitUnit
): RunSplitPoint[] | null {
  if (!splits.length) return null;

  const data: RunSplitPoint[] = [];
  for (const s of splits) {
    if (!Number.isFinite(s.split) || s.split < 1) continue;
    const moving =
      s.moving_time > 0
        ? s.moving_time
        : s.elapsed_time > 0
          ? s.elapsed_time
          : 0;
    if (moving <= 0 && !(s.distance > 0)) continue;

    data.push({
      split: s.split,
      distanceMeters: s.distance > 0 ? s.distance : 0,
      elapsedTimeSec: s.elapsed_time > 0 ? s.elapsed_time : moving,
      movingTimeSec: moving,
      averageSpeedMps: finiteOrNull(s.average_speed),
      averageGradeAdjustedSpeedMps: finiteOrNull(
        s.average_grade_adjusted_speed
      ),
      elevationDifferenceMeters: finiteOrNull(s.elevation_difference),
      unit,
    });
  }

  if (!data.length) return null;
  return data.sort((a, b) => a.split - b.split);
}

/**
 * Prefer metric (km) splits; fall back to standard (mi) when metric is empty.
 * Grade-adjusted speed is only populated for runs (may be null per split).
 */
export function pickRunSplitsFromActivity(activity: {
  splits_metric?: StravaSplit[] | null;
  splits_standard?: StravaSplit[] | null;
}): RunSplitPoint[] | null {
  const metric = mapStravaSplitsToRunSplits(
    activity.splits_metric ?? [],
    "metric"
  );
  if (metric?.length) return metric;
  return mapStravaSplitsToRunSplits(
    activity.splits_standard ?? [],
    "standard"
  );
}

/** Convert grade-adjusted speed (m/s) to seconds per kilometer. */
export function gradeAdjustedPaceSecPerKm(
  averageGradeAdjustedSpeedMps: number | null | undefined
): number | null {
  if (
    averageGradeAdjustedSpeedMps == null ||
    !(averageGradeAdjustedSpeedMps > 0)
  ) {
    return null;
  }
  return 1000 / averageGradeAdjustedSpeedMps;
}
