import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidTimeZone, todayKeyInTimeZone } from "./timezone-format";

describe("todayKeyInTimeZone", () => {
  it("returns the local calendar day in a western US zone before UTC midnight rollover", () => {
    // 2026-07-29 01:02 UTC == 2026-07-28 18:02 in America/Los_Angeles
    const now = new Date("2026-07-29T01:02:00.000Z");
    assert.equal(todayKeyInTimeZone("America/Los_Angeles", now), "2026-07-28");
    assert.equal(todayKeyInTimeZone("UTC", now), "2026-07-29");
  });

  it("handles eastern US evening correctly", () => {
    // 2026-07-29 01:02 UTC == 2026-07-28 21:02 in America/New_York
    const now = new Date("2026-07-29T01:02:00.000Z");
    assert.equal(todayKeyInTimeZone("America/New_York", now), "2026-07-28");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    assert.equal(isValidTimeZone("America/Chicago"), true);
    assert.equal(isValidTimeZone("Not/AZone"), false);
  });
});
