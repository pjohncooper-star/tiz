import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComputedMesocycle } from "./types";
import { computeWeeklyVolumeCurve, peakWeekIndex } from "./volume-curve";

const twoMesocycles: ComputedMesocycle[] = [
  {
    phaseIndex: 0,
    name: "Base I",
    index: 0,
    startWeekIndex: 0,
    endWeekIndex: 3,
  },
  {
    phaseIndex: 0,
    name: "Base II",
    index: 1,
    startWeekIndex: 4,
    endWeekIndex: 5,
  },
];

describe("volume-curve", () => {
  it("steps from start to peak at mesocycle boundaries", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 6,
      phaseKindsByWeek: ["BASE", "BASE", "BUILD", "BUILD", "BUILD", "BUILD"],
      mesocycles: twoMesocycles,
      startHours: 8,
      peakHours: 12,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false, false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[0], 8);
    assert.equal(hours[3], 8);
    assert.equal(hours[4], 12);
    assert.equal(hours[5], 12);
  });

  it("holds hours flat within each mesocycle", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 6,
      phaseKindsByWeek: ["BASE", "BASE", "BASE", "BASE", "BUILD", "BUILD"],
      mesocycles: twoMesocycles,
      startHours: 8,
      peakHours: 12,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false, false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[1], hours[0]);
    assert.equal(hours[2], hours[0]);
    assert.equal(hours[5], hours[4]);
  });

  it("applies race prep at 90% of peak", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 3,
      phaseKindsByWeek: ["BUILD", "RACE_PREP", "RACE_PREP"],
      mesocycles: [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 0,
        },
      ],
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
      mesocycles: [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 0,
        },
      ],
      startHours: 10,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadFlags: [false, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[1], 7);
    assert.equal(hours[2], 4.5);
  });

  it("reduces de-load weeks by volume percent without advancing the meso step", () => {
    const hours = computeWeeklyVolumeCurve({
      totalWeeks: 4,
      phaseKindsByWeek: ["BUILD", "BUILD", "BUILD", "BUILD"],
      mesocycles: [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 3,
        },
      ],
      startHours: 10,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadFlags: [false, true, false, false],
      deLoadVolumePercent: 60,
    });
    assert.equal(hours[0], 10);
    assert.equal(hours[1], 6);
    assert.equal(hours[2], 10);
    assert.equal(hours[3], 10);
  });

  it("finds peak week index", () => {
    const hours = [8, 9, 10, 9, 7, 4.5];
    assert.equal(peakWeekIndex(hours), 2);
  });
});
