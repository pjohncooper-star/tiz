import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gradeAdjustedPaceSecPerKm,
  mapStravaSplitsToRunSplits,
  pickRunSplitsFromActivity,
} from "./splits";

describe("mapStravaSplitsToRunSplits", () => {
  it("maps grade-adjusted speed and sorts by split index", () => {
    const splits = mapStravaSplitsToRunSplits(
      [
        {
          distance: 1001.5,
          elapsed_time: 300,
          moving_time: 295,
          split: 2,
          average_speed: 3.4,
          average_grade_adjusted_speed: 3.55,
          elevation_difference: -4.2,
        },
        {
          distance: 1000.2,
          elapsed_time: 280,
          moving_time: 280,
          split: 1,
          average_speed: 3.57,
          average_grade_adjusted_speed: 3.5,
          elevation_difference: 12.1,
        },
      ],
      "metric"
    );

    assert.ok(splits);
    assert.equal(splits.length, 2);
    assert.equal(splits[0]!.split, 1);
    assert.equal(splits[0]!.averageGradeAdjustedSpeedMps, 3.5);
    assert.equal(splits[0]!.unit, "metric");
    assert.equal(splits[1]!.split, 2);
    assert.equal(splits[1]!.averageGradeAdjustedSpeedMps, 3.55);
    assert.equal(splits[1]!.elevationDifferenceMeters, -4.2);
  });

  it("keeps null grade-adjusted speed when Strava omits it", () => {
    const splits = mapStravaSplitsToRunSplits(
      [
        {
          distance: 1609.3,
          elapsed_time: 420,
          moving_time: 418,
          split: 1,
          average_speed: 3.85,
          average_grade_adjusted_speed: null,
        },
      ],
      "standard"
    );

    assert.ok(splits);
    assert.equal(splits[0]!.averageGradeAdjustedSpeedMps, null);
    assert.equal(splits[0]!.averageSpeedMps, 3.85);
    assert.equal(splits[0]!.unit, "standard");
  });

  it("returns null for empty input", () => {
    assert.equal(mapStravaSplitsToRunSplits([], "metric"), null);
  });
});

describe("pickRunSplitsFromActivity", () => {
  it("prefers metric splits over standard", () => {
    const picked = pickRunSplitsFromActivity({
      splits_metric: [
        {
          distance: 1000,
          elapsed_time: 300,
          moving_time: 300,
          split: 1,
          average_grade_adjusted_speed: 3.3,
        },
      ],
      splits_standard: [
        {
          distance: 1609,
          elapsed_time: 480,
          moving_time: 480,
          split: 1,
          average_grade_adjusted_speed: 3.35,
        },
      ],
    });

    assert.ok(picked);
    assert.equal(picked.length, 1);
    assert.equal(picked[0]!.unit, "metric");
    assert.equal(picked[0]!.averageGradeAdjustedSpeedMps, 3.3);
  });

  it("falls back to standard when metric is missing", () => {
    const picked = pickRunSplitsFromActivity({
      splits_metric: [],
      splits_standard: [
        {
          distance: 1609,
          elapsed_time: 480,
          moving_time: 480,
          split: 1,
          average_speed: 3.35,
          average_grade_adjusted_speed: 3.4,
        },
      ],
    });

    assert.ok(picked);
    assert.equal(picked[0]!.unit, "standard");
    assert.equal(picked[0]!.averageGradeAdjustedSpeedMps, 3.4);
  });
});

describe("gradeAdjustedPaceSecPerKm", () => {
  it("converts m/s to sec/km", () => {
    assert.equal(gradeAdjustedPaceSecPerKm(3.3333333333)?.toFixed(1), "300.0");
  });

  it("returns null for missing or non-positive speed", () => {
    assert.equal(gradeAdjustedPaceSecPerKm(null), null);
    assert.equal(gradeAdjustedPaceSecPerKm(0), null);
    assert.equal(gradeAdjustedPaceSecPerKm(undefined), null);
  });
});
