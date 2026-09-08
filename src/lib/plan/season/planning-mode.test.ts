import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLANNING_MODE_HELP,
  PLANNING_MODE_LABELS,
  PLANNING_MODES,
  phaseForWeekIndex,
  planningModeSeparatesLongVolume,
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

  it("flags modes that separate long volume", () => {
    assert.equal(planningModeSeparatesLongVolume("SEPARATE_LONGS"), true);
    assert.equal(planningModeSeparatesLongVolume("SEPARATE_LONG_TIZ"), true);
    assert.equal(planningModeSeparatesLongVolume("BY_DISCIPLINE"), false);
    assert.equal(planningModeSeparatesLongVolume("OVERALL"), false);
  });

  it("names modes in athlete language with a help line each", () => {
    assert.equal(PLANNING_MODE_LABELS.OVERALL, "Overall volume");
    assert.equal(PLANNING_MODE_LABELS.BY_DISCIPLINE, "By discipline");
    assert.equal(
      PLANNING_MODE_LABELS.SEPARATE_LONGS,
      "Plan longs separately from weekly hours"
    );
    assert.equal(
      PLANNING_MODE_LABELS.SEPARATE_LONG_TIZ,
      "Plan long hours and zone minutes separately"
    );
    for (const mode of PLANNING_MODES) {
      assert.equal(typeof PLANNING_MODE_HELP[mode], "string");
      assert.ok(PLANNING_MODE_HELP[mode].length > 10);
    }
  });
});
