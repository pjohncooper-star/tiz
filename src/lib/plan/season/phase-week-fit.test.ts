import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phaseWeekTotal } from "./default-phases";
import { fitPhasesToTotalWeeks } from "./phase-week-fit";
import type { SeasonPhaseInput } from "./types";

function phase(
  name: string,
  weekCount: number,
  sortOrder: number,
  id?: string
): SeasonPhaseInput {
  return {
    id,
    name,
    sortOrder,
    weekCount,
    phaseKind: name.toLowerCase().includes("taper")
      ? "TAPER"
      : name.toLowerCase().includes("build")
        ? "BUILD"
        : "BASE",
    focusMode: "PHASE",
    phaseFocus: "AEROBIC_BASE",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
  };
}

describe("fitPhasesToTotalWeeks", () => {
  it("trims weeks from the first phase when shortening", () => {
    const phases = [phase("Base", 12, 0), phase("Build", 8, 1), phase("Taper", 2, 2)];
    const fitted = fitPhasesToTotalWeeks(phases, 18, 4);
    assert.equal(phaseWeekTotal(fitted), 18);
    assert.equal(fitted[0]!.name, "Base");
    assert.equal(fitted[0]!.weekCount, 8);
    assert.equal(fitted[1]!.weekCount, 8);
    assert.equal(fitted[2]!.weekCount, 2);
  });

  it("removes leading phases when shortening past the first block", () => {
    const phases = [phase("Base", 8, 0), phase("Build", 8, 1), phase("Taper", 2, 2)];
    const fitted = fitPhasesToTotalWeeks(phases, 10, 4);
    assert.equal(phaseWeekTotal(fitted), 10);
    assert.equal(fitted.length, 2);
    assert.equal(fitted[0]!.name, "Build");
    assert.equal(fitted[0]!.weekCount, 8);
    assert.equal(fitted[1]!.weekCount, 2);
  });

  it("extends the first phase when lengthening", () => {
    const phases = [phase("Base", 8, 0), phase("Build", 8, 1), phase("Taper", 2, 2)];
    const fitted = fitPhasesToTotalWeeks(phases, 22, 4);
    assert.equal(phaseWeekTotal(fitted), 22);
    assert.equal(fitted[0]!.weekCount, 12);
    assert.equal(fitted[1]!.weekCount, 8);
    assert.equal(fitted[2]!.weekCount, 2);
  });

  it("regenerates mesocycles when week count changes", () => {
    const phases = [
      {
        ...phase("Base", 12, 0, "p1"),
        mesocycles: [{ name: "Base I", weekCount: 12 }],
      },
    ];
    const fitted = fitPhasesToTotalWeeks(phases, 8, 4);
    assert.equal(fitted[0]!.weekCount, 8);
    assert.ok((fitted[0]!.mesocycles?.length ?? 0) >= 2);
    assert.equal(
      fitted[0]!.mesocycles!.reduce((sum, m) => sum + m.weekCount, 0),
      8
    );
  });

  it("falls back to suggested layout when input is empty", () => {
    const fitted = fitPhasesToTotalWeeks([], 12, 4);
    assert.equal(phaseWeekTotal(fitted), 12);
    assert.ok(fitted.length > 0);
  });

  it("leaves phases unchanged when totals already match", () => {
    const phases = [phase("Base", 8, 0), phase("Taper", 2, 1)];
    const fitted = fitPhasesToTotalWeeks(phases, 10, 4);
    assert.deepEqual(
      fitted.map((p) => p.weekCount),
      [8, 2]
    );
  });
});
