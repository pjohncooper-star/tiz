import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeWeeklyVolumeCurve, peakWeekIndex } from "./volume-curve";

describe("volume-curve", () => {
  it("ramps from start to peak during base/build", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 6,
      phaseKindsByWeek: ["BASE", "BASE", "BUILD", "BUILD", "BUILD", "BUILD"],
      startHours: 8,
      peakHours: 12,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false, false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[0], 8);
    assert.ok(hours[5]! >= 11);
    assert.ok(hours[5]! <= 12);
  });

  it("applies race prep at 90% of peak", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 3,
      phaseKindsByWeek: ["BUILD", "RACE_PREP", "RACE_PREP"],
      startHours: 10,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[1], 9);
    assert.equal(hours[2], 9);
  });

  it("tapers from 70% to 45% of peak", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 3,
      phaseKindsByWeek: ["BUILD", "TAPER", "TAPER"],
      startHours: 10,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[1], 7);
    assert.equal(hours[2], 4.5);
  });

  it("reduces de-load weeks by volume percent", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 2,
      phaseKindsByWeek: ["BUILD", "BUILD"],
      startHours: 10,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadFlags: [false, true],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[1], 6);
  });

  it("finds peak week index", () => {
    const hours = [8, 9, 10, 9, 7, 4.5];
    assert.equal(peakWeekIndex(hours), 2);
  });
});
