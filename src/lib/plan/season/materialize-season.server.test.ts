import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { phaseSpansWithIds } from "./materialize-season.server";

describe("phaseSpansWithIds", () => {
  it("resolves stored start indices and includes phase ids", () => {
    const spans = phaseSpansWithIds([
      {
        id: "base",
        sortOrder: 0,
        startWeekIndex: 0,
        weekCount: 4,
        weeklyTemplateId: "t-base",
      },
      {
        id: "build",
        sortOrder: 1,
        startWeekIndex: 4,
        weekCount: 6,
        weeklyTemplateId: "t-build",
      },
    ]);

    assert.deepEqual(spans, [
      {
        phaseId: "base",
        startWeekIndex: 0,
        endWeekIndex: 3,
        weeklyTemplateId: "t-base",
      },
      {
        phaseId: "build",
        startWeekIndex: 4,
        endWeekIndex: 9,
        weeklyTemplateId: "t-build",
      },
    ]);
  });

  it("chains phases without stored starts", () => {
    const spans = phaseSpansWithIds([
      {
        id: "a",
        sortOrder: 0,
        startWeekIndex: -1,
        weekCount: 3,
        weeklyTemplateId: null,
      },
      {
        id: "b",
        sortOrder: 1,
        startWeekIndex: -1,
        weekCount: 2,
        weeklyTemplateId: "t-b",
      },
    ]);

    assert.equal(spans[0]?.phaseId, "a");
    assert.equal(spans[0]?.startWeekIndex, 0);
    assert.equal(spans[0]?.endWeekIndex, 2);
    assert.equal(spans[1]?.phaseId, "b");
    assert.equal(spans[1]?.startWeekIndex, 3);
    assert.equal(spans[1]?.endWeekIndex, 4);
  });

  it("omits phases with zero week count", () => {
    const spans = phaseSpansWithIds([
      {
        id: "empty",
        sortOrder: 0,
        startWeekIndex: -1,
        weekCount: 0,
        weeklyTemplateId: null,
      },
    ]);
    assert.equal(spans.length, 0);
  });
});
