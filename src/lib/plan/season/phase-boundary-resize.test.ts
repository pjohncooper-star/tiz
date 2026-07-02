import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  phaseStartWeekIndices,
  resizePhaseBoundaryAtWeek,
} from "./phase-boundary-resize";

describe("phase-boundary-resize", () => {
  it("computes phase start week indices", () => {
    assert.deepEqual(phaseStartWeekIndices([8, 8, 8, 2]), [0, 8, 16, 24]);
  });

  it("redistributes weeks between adjacent phases", () => {
    const result = resizePhaseBoundaryAtWeek([8, 8, 8, 2], 0, 10);
    assert.deepEqual(result, [10, 6, 8, 2]);
    assert.equal(result!.reduce((sum, weeks) => sum + weeks, 0), 26);
  });

  it("keeps at least one week in each adjacent phase", () => {
    assert.deepEqual(resizePhaseBoundaryAtWeek([8, 8], 0, 0), [1, 15]);
    assert.deepEqual(resizePhaseBoundaryAtWeek([8, 8], 0, 99), [15, 1]);
  });

  it("returns null for invalid boundary index", () => {
    assert.equal(resizePhaseBoundaryAtWeek([8, 8], -1, 4), null);
    assert.equal(resizePhaseBoundaryAtWeek([8], 0, 4), null);
  });
});
