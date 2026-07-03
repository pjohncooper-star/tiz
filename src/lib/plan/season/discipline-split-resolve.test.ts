import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  phaseKindDefaultSplit,
  planUsesCustomSplits,
  resolveSplitForWeek,
  splitHoursByResolvedSplit,
} from "./discipline-split-resolve";
import { resolveMesocycles } from "./phase-split";
import type { SeasonPhaseInput } from "./types";

function basePhase(overrides: Partial<SeasonPhaseInput> = {}): SeasonPhaseInput {
  return {
    name: "Base",
    sortOrder: 0,
    weekCount: 8,
    phaseKind: "BASE",
    focusMode: "PHASE",
    phaseFocus: "AEROBIC_BASE",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
    mesocycles: [
      { name: "Base I", weekCount: 4, swimSplitPercent: 15, bikeSplitPercent: 50 },
      { name: "Base II", weekCount: 4, swimSplitPercent: 10, bikeSplitPercent: 40, runSplitPercent: 50 },
    ],
    ...overrides,
  };
}

describe("discipline-split-resolve", () => {
  it("uses phase-kind default when nothing custom is set", () => {
    const phase = basePhase({ mesocycles: undefined });
    const mesocycles = resolveMesocycles([phase], 4);
    const split = resolveSplitForWeek(0, "BASE", mesocycles, [phase], {});
    assert.deepEqual(split, phaseKindDefaultSplit("BASE"));
  });

  it("uses season split when mesocycle has no override", () => {
    const phase = basePhase({
      mesocycles: [{ name: "Base I", weekCount: 8 }],
    });
    const mesocycles = resolveMesocycles([phase], 8);
    const split = resolveSplitForWeek(2, "BASE", mesocycles, [phase], {
      swimSplitPercent: 20,
      bikeSplitPercent: 45,
    });
    assert.equal(split.swim, 20);
    assert.equal(split.bike, 45);
    assert.equal(split.run, 35);
  });

  it("mesocycle split overrides season split", () => {
    const phase = basePhase();
    const mesocycles = resolveMesocycles([phase], 4);
    const week0 = resolveSplitForWeek(0, "BASE", mesocycles, [phase], {
      swimSplitPercent: 18,
      bikeSplitPercent: 48,
    });
    assert.equal(week0.swim, 15);
    assert.equal(week0.bike, 50);
    assert.equal(week0.run, 35);

    const week4 = resolveSplitForWeek(4, "BASE", mesocycles, [phase], {
      swimSplitPercent: 18,
      bikeSplitPercent: 48,
    });
    assert.equal(week4.swim, 10);
    assert.equal(week4.bike, 40);
    assert.equal(week4.run, 50);
  });

  it("splitHoursByResolvedSplit sums to total", () => {
    const hours = splitHoursByResolvedSplit(12, { swim: 15, bike: 50, run: 35 });
    assert.equal(hours.swimHours + hours.bikeHours + hours.runHours, 12);
  });

  it("planUsesCustomSplits detects season or mesocycle config", () => {
    assert.equal(planUsesCustomSplits({}, [basePhase({ mesocycles: undefined })]), false);
    assert.equal(
      planUsesCustomSplits({ swimSplitPercent: 15 }, [basePhase({ mesocycles: undefined })]),
      true
    );
    assert.equal(planUsesCustomSplits({}, [basePhase()]), true);
  });
});
