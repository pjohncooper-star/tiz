import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { phaseSpansWithIds, resolveLongSeatAction } from "./materialize-season.server";

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

describe("resolveLongSeatAction", () => {
  it("returns null when planning mode does not separate longs", () => {
    assert.equal(
      resolveLongSeatAction({
        planningMode: "BY_DISCIPLINE",
        isRestWeek: false,
        isTaperPhase: false,
        longWeekOn: false,
        policy: "EXTRA_INTENSITY",
        endurancePercent: 60,
        fullLongMinutes: 120,
      }),
      null
    );
  });

  it("returns full_long when the long-week checkbox is on", () => {
    assert.deepEqual(
      resolveLongSeatAction({
        planningMode: "SEPARATE_LONGS",
        isRestWeek: false,
        isTaperPhase: false,
        longWeekOn: true,
        policy: "EXTRA_INTENSITY",
        endurancePercent: 60,
        fullLongMinutes: 120,
      }),
      { kind: "full_long" }
    );
  });

  it("returns extra_intensity on off weeks with EXTRA_INTENSITY policy", () => {
    assert.deepEqual(
      resolveLongSeatAction({
        planningMode: "SEPARATE_LONG_TIZ",
        isRestWeek: false,
        isTaperPhase: false,
        longWeekOn: false,
        policy: "EXTRA_INTENSITY",
        endurancePercent: 60,
        fullLongMinutes: 120,
      }),
      { kind: "extra_intensity" }
    );
  });

  it("returns substitute_endurance with scaled minutes", () => {
    assert.deepEqual(
      resolveLongSeatAction({
        planningMode: "SEPARATE_LONGS",
        isRestWeek: false,
        isTaperPhase: false,
        longWeekOn: false,
        policy: "ENDURANCE_PERCENT",
        endurancePercent: 50,
        fullLongMinutes: 120,
      }),
      { kind: "substitute_endurance", durationMinutes: 60 }
    );
  });

  it("omits longs on rest or taper weeks", () => {
    assert.deepEqual(
      resolveLongSeatAction({
        planningMode: "SEPARATE_LONGS",
        isRestWeek: true,
        isTaperPhase: false,
        longWeekOn: true,
        policy: "EXTRA_INTENSITY",
        endurancePercent: 60,
        fullLongMinutes: 120,
      }),
      { kind: "omit" }
    );
  });
});
