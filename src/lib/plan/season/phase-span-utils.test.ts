import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
  DEFAULT_PHASE_VOLUME_FIELDS,
} from "@/components/simple-planner/simple-planner-types";
import {
  buildGutterSegments,
  deletePhaseWithMerge,
  fitSimplePhasesToTotalWeeks,
  hasFullPhaseCoverage,
  normalizePhasesToFullCoverage,
  resizePhaseBottomBoundary,
  resizePhaseTopBoundary,
  splitLongestPhase,
  splitPhaseAtWeek,
} from "./phase-span-utils";

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
    ...DEFAULT_PHASE_VOLUME_FIELDS,
    zoneSplits: null,
  };
}

describe("phase-span-utils", () => {
  it("normalizes gaps into full season coverage", () => {
    const normalized = normalizePhasesToFullCoverage([phase(1, 3, "a")], 6);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]!.startWeekIndex, 0);
    assert.equal(normalized[0]!.endWeekIndex, 5);
    assert.equal(hasFullPhaseCoverage(normalized, 6), true);
  });

  it("suggests default phases when none are assigned", () => {
    const normalized = normalizePhasesToFullCoverage([], 12);
    assert.ok(normalized.length >= 2);
    assert.equal(normalized[0]!.startWeekIndex, 0);
    assert.equal(normalized[normalized.length - 1]!.endWeekIndex, 11);
  });

  it("resizes phase boundaries without leaving gaps", () => {
    const phases = [phase(0, 3, "a"), phase(4, 7, "b")];
    const covered = normalizePhasesToFullCoverage(phases, 8);
    const resized = resizePhaseBottomBoundary(covered, "a", 8, 2);
    assert.deepEqual(
      resized.map((item) => [item.startWeekIndex, item.endWeekIndex]),
      [
        [0, 2],
        [3, 7],
      ]
    );
  });

  it("prevents removing the final week from a phase when resizing top", () => {
    const phases = [phase(0, 3, "a"), phase(4, 7, "b")];
    const covered = normalizePhasesToFullCoverage(phases, 8);
    const resized = resizePhaseTopBoundary(covered, "b", 8, 7);
    assert.equal(resized[1]!.startWeekIndex, 4);
    assert.equal(resized[0]!.endWeekIndex, 3);
  });

  it("fits phases when season length changes", () => {
    const phases = [phase(0, 5, "a"), phase(6, 11, "b")];
    const fitted = fitSimplePhasesToTotalWeeks(phases, 10);
    assert.equal(fitted[0]!.startWeekIndex, 0);
    assert.equal(fitted[fitted.length - 1]!.endWeekIndex, 9);
    assert.equal(hasFullPhaseCoverage(fitted, 10), true);
  });

  it("splits the longest phase when adding another phase", () => {
    const phases = [phase(0, 7, "a")];
    const split = splitLongestPhase(phases, 8);
    assert.equal(split.length, 2);
    assert.equal(split[0]!.endWeekIndex, 3);
    assert.equal(split[1]!.startWeekIndex, 4);
    assert.equal(split[1]!.endWeekIndex, 7);
  });

  it("splits a phase at a specific week", () => {
    const phases = [phase(0, 5, "a")];
    const split = splitPhaseAtWeek(phases, 3, 6);
    assert.equal(split.length, 2);
    assert.deepEqual(
      split.map((item) => [item.startWeekIndex, item.endWeekIndex]),
      [
        [0, 2],
        [3, 5],
      ]
    );
  });

  it("merges a deleted phase into its neighbor", () => {
    const phases = [phase(0, 3, "a"), phase(4, 7, "b")];
    const covered = normalizePhasesToFullCoverage(phases, 8);
    const merged = deletePhaseWithMerge(covered, "a", 8);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.startWeekIndex, 0);
    assert.equal(merged[0]!.endWeekIndex, 7);
  });

  it("builds contiguous gutter segments", () => {
    const weeks = Array.from({ length: 5 }, (_, weekIndex) => ({ weekIndex }));
    const segments = buildGutterSegments(weeks, [phase(0, 4, "a")]);
    assert.equal(segments.length, 1);
    assert.equal(segments[0]!.rowCount, 5);
  });
});
