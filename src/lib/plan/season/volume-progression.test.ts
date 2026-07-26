import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferVolumeProgressionMode,
  resolveProgressionExit,
  volumeAtProgressionWeek,
  volumeEndFromStartAndStep,
  weeklyStepVolumeAtWeek,
} from "./volume-progression";

describe("volume-progression", () => {
  it("infers TARGET when end is set", () => {
    assert.equal(
      inferVolumeProgressionMode({ volumeEndHours: 10, volumeRampPercent: 5 }),
      "TARGET"
    );
  });

  it("infers PERCENT when only ramp is set", () => {
    assert.equal(inferVolumeProgressionMode({ volumeRampPercent: 10 }), "PERCENT");
  });

  it("infers STEP when step is set", () => {
    assert.equal(inferVolumeProgressionMode({ volumeStepHours: 0.25 }), "STEP");
  });

  it("compounds percent weekly", () => {
    assert.equal(
      volumeAtProgressionWeek({
        entry: 10,
        rampPercent: 10,
        progressionMode: "PERCENT",
        mesocycleMode: "INCREASE",
        weekOffset: 2,
        weekCount: 4,
        rampOn: true,
      }),
      12.1
    );
  });

  it("caps percent growth at exit", () => {
    assert.equal(
      volumeAtProgressionWeek({
        entry: 10,
        exit: 11,
        rampPercent: 10,
        progressionMode: "PERCENT",
        mesocycleMode: "INCREASE",
        weekOffset: 2,
        weekCount: 4,
        rampOn: true,
      }),
      11
    );
  });

  it("steps absolute hours weekly", () => {
    assert.equal(weeklyStepVolumeAtWeek(2, 0.25, 0, "INCREASE"), 2);
    assert.equal(weeklyStepVolumeAtWeek(2, 0.25, 1, "INCREASE"), 2.25);
    assert.equal(weeklyStepVolumeAtWeek(2, 0.25, 2, "INCREASE"), 2.5);
    assert.equal(volumeEndFromStartAndStep(2, 0.25, 5, "INCREASE"), 3);
  });

  it("resolves STEP exit for chaining", () => {
    assert.equal(
      resolveProgressionExit({
        entry: 3,
        stepHours: 0.5,
        progressionMode: "STEP",
        mesocycleMode: "INCREASE",
        weekCount: 4,
      }),
      4.5
    );
  });

  it("linear TARGET between entry and exit", () => {
    assert.equal(
      volumeAtProgressionWeek({
        entry: 6,
        exit: 8,
        progressionMode: "TARGET",
        mesocycleMode: "INCREASE",
        weekOffset: 1,
        weekCount: 3,
        rampOn: true,
      }),
      7
    );
  });
});
