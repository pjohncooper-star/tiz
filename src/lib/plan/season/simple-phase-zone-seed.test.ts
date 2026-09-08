import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phasesForCreateSeed } from "./simple-phase-zone-seed";
import { suggestPhasesForWeeks } from "./default-phases";

describe("phasesForCreateSeed", () => {
  it("returns no phases for empty or omitted seed", () => {
    assert.deepEqual(phasesForCreateSeed("empty", 20), []);
    assert.deepEqual(phasesForCreateSeed(undefined, 20), []);
  });

  it("writes suggested phases covering the season without client ids", () => {
    const phases = phasesForCreateSeed("suggested", 20);
    const suggested = suggestPhasesForWeeks(20);
    assert.equal(phases.length, suggested.length);
    assert.ok(phases.every((phase) => !("id" in phase) || phase.id === undefined));
    assert.equal(phases[0]?.startWeekIndex, 0);
    assert.equal(phases.at(-1)?.endWeekIndex, 19);
    assert.deepEqual(
      phases.map((phase) => phase.endWeekIndex - phase.startWeekIndex + 1),
      suggested.map((phase) => phase.weekCount)
    );
  });
});
