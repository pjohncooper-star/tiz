import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLongOffWeekPolicy,
  shouldSuppressLongForWeek,
} from "./long-offweek-policy";

describe("long-offweek-policy", () => {
  it("returns none for NONE policy", () => {
    assert.deepEqual(
      applyLongOffWeekPolicy({
        policy: "NONE",
        fullLongMinutes: 120,
        endurancePercent: 60,
      }),
      { kind: "none" }
    );
  });

  it("returns extra intensity for EXTRA_INTENSITY", () => {
    assert.deepEqual(
      applyLongOffWeekPolicy({
        policy: "EXTRA_INTENSITY",
        fullLongMinutes: 120,
        endurancePercent: 60,
      }),
      { kind: "extra_intensity" }
    );
  });

  it("computes substitute endurance minutes from percent", () => {
    const result = applyLongOffWeekPolicy({
      policy: "ENDURANCE_PERCENT",
      fullLongMinutes: 100,
      endurancePercent: 60,
    });
    assert.equal(result.kind, "substitute_endurance");
    if (result.kind === "substitute_endurance") {
      assert.equal(result.durationMinutes, 60);
    }
  });

  it("suppresses long on rest and taper weeks", () => {
    assert.equal(
      shouldSuppressLongForWeek({ isRestWeek: true, isTaperPhase: false, isDeLoadWeek: true }),
      true
    );
    assert.equal(
      shouldSuppressLongForWeek({ isRestWeek: false, isTaperPhase: true, isDeLoadWeek: false }),
      true
    );
    assert.equal(
      shouldSuppressLongForWeek({ isRestWeek: false, isTaperPhase: false, isDeLoadWeek: false }),
      false
    );
  });
});
