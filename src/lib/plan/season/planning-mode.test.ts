import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  phaseForWeekIndex,
  planningModeIncludesLongs,
  resolvePlanningModeForWeek,
} from "./planning-mode";

describe("planning-mode", () => {
  it("resolves season default when no phase covers week", () => {
    assert.equal(
      resolvePlanningModeForWeek(0, [], "BY_DISCIPLINE"),
      "BY_DISCIPLINE"
    );
  });

  it("uses phase override over season default", () => {
    const mode = resolvePlanningModeForWeek(2, [
      {
        startWeekIndex: 0,
        endWeekIndex: 5,
        planningMode: "SEPARATE_LONGS",
        phaseKind: "BASE",
      },
    ], "BY_DISCIPLINE");
    assert.equal(mode, "SEPARATE_LONGS");
  });

  it("falls back to season default when phase override is null", () => {
    const mode = resolvePlanningModeForWeek(1, [
      {
        startWeekIndex: 0,
        endWeekIndex: 3,
        planningMode: null,
        phaseKind: "BUILD",
      },
    ], "OVERALL");
    assert.equal(mode, "OVERALL");
  });

  it("finds phase span for week index", () => {
    const phase = phaseForWeekIndex(3, [
      { startWeekIndex: 0, endWeekIndex: 2 },
      { startWeekIndex: 3, endWeekIndex: 7 },
    ]);
    assert.equal(phase?.startWeekIndex, 3);
  });

  it("flags long modes", () => {
    assert.equal(planningModeIncludesLongs("SEPARATE_LONGS"), true);
    assert.equal(planningModeIncludesLongs("SEPARATE_LONG_TIZ"), true);
    assert.equal(planningModeIncludesLongs("BY_DISCIPLINE"), false);
  });
});
