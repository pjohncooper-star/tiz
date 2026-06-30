import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markDeLoadWeeks,
  markDeLoadWeeksPerMesocycle,
  mergeDeLoadFlags,
  mesocycleLayoutFingerprint,
} from "./de-load-cadence";
import type { ComputedMesocycle } from "./types";

const twoFourWeekMesos: ComputedMesocycle[] = [
  { phaseIndex: 0, name: "Base I", index: 0, startWeekIndex: 0, endWeekIndex: 3 },
  { phaseIndex: 0, name: "Base II", index: 1, startWeekIndex: 4, endWeekIndex: 7 },
];

describe("de-load cadence", () => {
  it("restarts cadence at each mesocycle boundary", () => {
    const perMeso = markDeLoadWeeksPerMesocycle({
      mesocycles: twoFourWeekMesos,
      totalWeeks: 8,
      everyNWeeks: 2,
    });
    const seasonWide = markDeLoadWeeks({ totalWeeks: 8, everyNWeeks: 2 });

    assert.deepEqual(perMeso, [false, false, true, false, false, false, true, false]);
    assert.deepEqual(seasonWide, [false, false, true, false, true, false, true, false]);
    assert.equal(perMeso[4], false);
    assert.equal(seasonWide[4], true);
  });

  it("marks every N weeks within each mesocycle when length allows", () => {
    const mesocycles: ComputedMesocycle[] = [
      { phaseIndex: 0, name: "Build I", index: 0, startWeekIndex: 0, endWeekIndex: 4 },
      { phaseIndex: 0, name: "Build II", index: 1, startWeekIndex: 5, endWeekIndex: 9 },
    ];
    const flags = markDeLoadWeeksPerMesocycle({
      mesocycles,
      totalWeeks: 10,
      everyNWeeks: 4,
    });
    assert.equal(flags[4], true);
    assert.equal(flags[9], true);
    assert.equal(flags[8], false);
  });

  it("suppresses de-load on taper weeks", () => {
    const flags = markDeLoadWeeksPerMesocycle({
      mesocycles: [{ phaseIndex: 0, name: "Taper", index: 0, startWeekIndex: 0, endWeekIndex: 7 }],
      totalWeeks: 8,
      everyNWeeks: 2,
      taperWeekIndices: [2, 6],
    });
    assert.equal(flags[2], false);
    assert.equal(flags[6], false);
    assert.equal(flags[4], true);
  });

  it("mergeDeLoadFlags prefers stored flags when length matches", () => {
    const defaults = [false, true, false, true];
    const stored = [true, false, true, false];
    assert.deepEqual(mergeDeLoadFlags(defaults, stored), stored);
    assert.deepEqual(mergeDeLoadFlags(defaults, [true, false]), defaults);
    assert.deepEqual(mergeDeLoadFlags(defaults, null), defaults);
  });

  it("mesocycleLayoutFingerprint changes when ranges change", () => {
    const a = mesocycleLayoutFingerprint(twoFourWeekMesos);
    const b = mesocycleLayoutFingerprint([
      { ...twoFourWeekMesos[0]!, endWeekIndex: 2 },
      { ...twoFourWeekMesos[1]!, startWeekIndex: 3, endWeekIndex: 7 },
    ]);
    assert.notEqual(a, b);
  });
});
