import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
} from "@/components/simple-planner/simple-planner-types";
import {
  buildGutterSegments,
  clampPhaseResize,
  formatUnassignedWeeks,
  isAssignedPhase,
  unassignedWeekRanges,
} from "./phase-span-utils";

import { defaultZoneSplitsForKind } from "./phase-zone-defaults";

function phase(
  start: number,
  end: number,
  id = "p1"
): SimplePhase {
  return {
    id,
    name: "Base",
    color: "#38bdf8",
    phaseKind: "BASE",
    startWeekIndex: start,
    endWeekIndex: end,
    rampEnabled: { swim: true, bike: true, run: true },
    ...DEFAULT_PHASE_SESSIONS,
    ...DEFAULT_PHASE_INTENSE_DAYS,
    goal: null,
    zoneSplits: defaultZoneSplitsForKind("BASE"),
  };
}

describe("phase-span-utils", () => {
  it("lists unassigned week ranges", () => {
    const phases = [phase(1, 3, "a")];
    assert.deepEqual(unassignedWeekRanges(6, phases), [
      { start: 0, end: 0 },
      { start: 4, end: 5 },
    ]);
    assert.equal(formatUnassignedWeeks(6, phases), "Wk 1, Wk 5–6");
  });

  it("prevents phase overlap when resizing", () => {
    const phases = [phase(0, 2, "a"), phase(5, 7, "b")];
    const clamped = clampPhaseResize(phases[0]!, phases, 10, 0, 6);
    assert.equal(clamped.endWeekIndex, 4);
  });

  it("builds gutter segments", () => {
    const weeks = Array.from({ length: 5 }, (_, weekIndex) => ({ weekIndex }));
    const segments = buildGutterSegments(weeks, [phase(1, 2, "a")]);
    assert.equal(segments.length, 4);
    assert.equal(segments[0]!.kind, "unassigned");
    assert.equal(segments[1]!.kind, "band");
    assert.equal(segments[1]!.rowCount, 2);
    assert.equal(segments[2]!.kind, "unassigned");
    assert.equal(segments[3]!.kind, "unassigned");
  });

  it("treats empty phase as unassigned", () => {
    const empty: SimplePhase = {
      id: "e",
      name: "New",
      color: "#fff",
      phaseKind: "BASE",
      startWeekIndex: -1,
      endWeekIndex: -1,
      rampEnabled: { swim: true, bike: true, run: true },
      ...DEFAULT_PHASE_SESSIONS,
      ...DEFAULT_PHASE_INTENSE_DAYS,
      goal: null,
      zoneSplits: null,
    };
    assert.equal(isAssignedPhase(empty), false);
  });
});
