import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mesocycleRampProgress,
  mesocycleRampStepIndex,
  mesocycleSteppedValue,
  rampMesocycles,
} from "./mesocycle-ramp";
import type { ComputedMesocycle } from "./types";

const mesocycles: ComputedMesocycle[] = [
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
    endWeekIndex: 7,
  },
];

describe("mesocycle-ramp", () => {
  it("filters ramp mesocycles to base and build phases", () => {
    const kinds = ["BASE", "BASE", "BASE", "BASE", "BUILD", "BUILD", "BUILD", "BUILD"];
    assert.equal(rampMesocycles(mesocycles, kinds).length, 2);
    const withTaper = [...kinds.slice(0, 6), "TAPER", "TAPER"] as const;
    const taperMeso: ComputedMesocycle = {
      phaseIndex: 0,
      name: "Taper I",
      index: 2,
      startWeekIndex: 6,
      endWeekIndex: 7,
    };
    assert.equal(rampMesocycles([...mesocycles, taperMeso], withTaper).length, 2);
  });

  it("maps week index to ramp mesocycle step", () => {
    const rampList = rampMesocycles(mesocycles, Array(8).fill("BASE"));
    assert.equal(mesocycleRampStepIndex(0, rampList), 0);
    assert.equal(mesocycleRampStepIndex(3, rampList), 0);
    assert.equal(mesocycleRampStepIndex(4, rampList), 1);
    assert.equal(mesocycleRampStepIndex(7, rampList), 1);
  });

  it("lerps from start to peak across ramp mesocycles", () => {
    assert.equal(mesocycleRampProgress(0, 2), 0);
    assert.equal(mesocycleRampProgress(1, 2), 1);
    assert.equal(mesocycleSteppedValue(8, 12, 0, 2), 8);
    assert.equal(mesocycleSteppedValue(8, 12, 1, 2), 12);
  });
});
