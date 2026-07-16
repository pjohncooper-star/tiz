import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPhaseBlocks, mesocycleIdForWeek } from "./phase-blocks";

describe("phase-blocks", () => {
  it("materializes two blocks for an 8-week phase with 4-week block length", () => {
    const phases = buildPhaseBlocks({
      mesocycleLengthWeeks: 4,
      phases: [
        {
          id: "phase-1",
          name: "Base",
          startWeekIndex: 0,
          endWeekIndex: 7,
          phaseKind: "BASE",
        },
      ],
    });

    assert.equal(phases.length, 1);
    assert.equal(phases[0]!.blocks.length, 2);
    assert.equal(phases[0]!.blocks[0]!.startWeekIndex, 0);
    assert.equal(phases[0]!.blocks[0]!.endWeekIndex, 3);
    assert.equal(phases[0]!.blocks[1]!.startWeekIndex, 4);
    assert.equal(phases[0]!.blocks[1]!.endWeekIndex, 7);
  });

  it("resolves mesocycle id for week index", () => {
    const phases = buildPhaseBlocks({
      mesocycleLengthWeeks: 4,
      phases: [
        {
          id: "phase-1",
          name: "Build",
          startWeekIndex: 0,
          endWeekIndex: 7,
        },
      ],
    });

    const blockId = mesocycleIdForWeek(5, phases);
    assert.equal(blockId, phases[0]!.blocks[1]!.id);
  });
});
