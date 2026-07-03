import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  volumeEndFromStartAndRamp,
  volumeRampPercentFromStartAndEnd,
  weeklyCompoundVolumeAtWeek,
} from "./volume-ramp-triad";

describe("volume-ramp-triad", () => {
  it("compounds weekly: 10, 11, 12.1 at 10% increase", () => {
    assert.equal(weeklyCompoundVolumeAtWeek(10, 10, 0, "INCREASE"), 10);
    assert.equal(weeklyCompoundVolumeAtWeek(10, 10, 1, "INCREASE"), 11);
    assert.equal(weeklyCompoundVolumeAtWeek(10, 10, 2, "INCREASE"), 12.1);
    assert.equal(volumeEndFromStartAndRamp(10, 10, 3, "INCREASE"), 12.1);
  });

  it("decrease: compounds down each week", () => {
    assert.equal(weeklyCompoundVolumeAtWeek(12, 10, 1, "DECREASE"), 10.8);
    assert.equal(volumeEndFromStartAndRamp(12, 10, 2, "DECREASE"), 10.8);
  });

  it("hold: flat each week", () => {
    assert.equal(weeklyCompoundVolumeAtWeek(12, 25, 3, "HOLD"), 12);
  });

  it("increase: start + end + week count → weekly ramp", () => {
    assert.equal(volumeRampPercentFromStartAndEnd(10, 12.1, 3, "INCREASE"), 10);
  });

  it("decrease: start + end + week count → weekly ramp", () => {
    assert.equal(volumeRampPercentFromStartAndEnd(12, 10.8, 2, "DECREASE"), 10);
  });

  it("hold: ramp is zero", () => {
    assert.equal(volumeRampPercentFromStartAndEnd(12, 12, 8, "HOLD"), 0);
  });
});
