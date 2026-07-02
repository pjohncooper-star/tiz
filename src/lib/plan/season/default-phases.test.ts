import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIXED_TEMPLATE_WEEKS,
  fixedPhasesForWeeks,
  percentagePhasesForWeeks,
  phaseWeekTotal,
  suggestPhasesForWeeks,
} from "./default-phases";

describe("suggestPhasesForWeeks", () => {
  it("uses percentage split below 26 weeks", () => {
    const suggested = suggestPhasesForWeeks(20);
    const percentage = percentagePhasesForWeeks(20);
    assert.deepEqual(
      suggested.map((p) => ({ kind: p.phaseKind, weeks: p.weekCount })),
      percentage.map((p) => ({ kind: p.phaseKind, weeks: p.weekCount }))
    );
    assert.equal(phaseWeekTotal(suggested), 20);
  });

  it("returns 8+8+8+2 for exactly 26 weeks", () => {
    const phases = suggestPhasesForWeeks(26);
    assert.equal(phases.length, 4);
    assert.deepEqual(
      phases.map((p) => p.weekCount),
      [8, 8, 8, 2]
    );
    assert.deepEqual(
      phases.map((p) => p.phaseKind),
      ["BASE", "BUILD", "RACE_PREP", "TAPER"]
    );
    assert.equal(phaseWeekTotal(phases), 26);
  });

  it("prepends one 8-week base for 34 weeks", () => {
    const phases = suggestPhasesForWeeks(34);
    assert.equal(phases.length, 5);
    assert.equal(phases[0]!.name, "Base");
    assert.equal(phases[0]!.weekCount, 8);
    assert.equal(phases[1]!.name, "Base II");
    assert.equal(phases[1]!.weekCount, 8);
    assert.equal(phaseWeekTotal(phases), 34);
  });

  it("prepends 8+6 base blocks for 40 weeks", () => {
    const phases = fixedPhasesForWeeks(40);
    assert.equal(phases.length, 6);
    assert.deepEqual(
      phases.map((p) => ({ name: p.name, weeks: p.weekCount, kind: p.phaseKind })),
      [
        { name: "Base", weeks: 8, kind: "BASE" },
        { name: "Base II", weeks: 6, kind: "BASE" },
        { name: "Base III", weeks: 8, kind: "BASE" },
        { name: "Build", weeks: 8, kind: "BUILD" },
        { name: "Race prep", weeks: 8, kind: "RACE_PREP" },
        { name: "Taper", weeks: 2, kind: "TAPER" },
      ]
    );
    assert.equal(phaseWeekTotal(phases), 40);
  });

  it("prepends partial base block when extra is under 8 weeks", () => {
    const phases = suggestPhasesForWeeks(33);
    assert.equal(phases[0]!.weekCount, 7);
    assert.equal(phases[0]!.name, "Base");
    assert.equal(phaseWeekTotal(phases), 33);
  });

  it("fixed template constant is 26", () => {
    assert.equal(FIXED_TEMPLATE_WEEKS, 26);
  });
});
