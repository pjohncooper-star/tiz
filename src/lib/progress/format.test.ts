import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMinuteDelta,
  formatMinutes,
  formatPercent,
  formatWeekRange,
  scoreTone,
  volumeTone,
} from "./format";

describe("progress format", () => {
  it("formats minutes, percents, and deltas", () => {
    assert.equal(formatMinutes(0), "—");
    assert.equal(formatMinutes(null), "—");
    assert.equal(formatMinutes(95), "1h 35m");
    assert.equal(formatPercent(null), "—");
    assert.equal(formatPercent(82.4), "82%");
    assert.equal(formatMinuteDelta(0.4), "on target");
    assert.equal(formatMinuteDelta(20), "+20m");
    assert.equal(formatMinuteDelta(-65), "-1h 5m");
  });

  it("tones volume around the target band", () => {
    assert.equal(volumeTone(null), "neutral");
    assert.equal(volumeTone(50), "low");
    assert.equal(volumeTone(80), "warn");
    assert.equal(volumeTone(100), "good");
    assert.equal(volumeTone(130), "high");
  });

  it("tones adherence scores", () => {
    assert.equal(scoreTone(null), "neutral");
    assert.equal(scoreTone(40), "low");
    assert.equal(scoreTone(70), "warn");
    assert.equal(scoreTone(95), "good");
  });

  it("formats a week range with the year on the end date", () => {
    assert.equal(formatWeekRange("2026-08-17", "2026-08-23"), "Aug 17 – Aug 23, 2026");
  });
});
