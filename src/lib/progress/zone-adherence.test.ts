import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addZoneArrays,
  percentOf,
  zoneDeltas,
  zoneOverlapMinutes,
  zoneOverlapPercent,
} from "./zone-adherence";

describe("zone adherence", () => {
  it("percentOf returns null without a baseline", () => {
    assert.equal(percentOf(10, 0), null);
    assert.equal(percentOf(50, 200), 25);
  });

  it("overlap counts only minutes in the right zones", () => {
    const target = [120, 30, 0, 20, 0];
    const actual = [90, 60, 40, 5, 0];
    assert.equal(zoneOverlapMinutes(target, actual), 90 + 30 + 5);
    assert.equal(zoneOverlapPercent(target, actual), (125 / 170) * 100);
  });

  it("overlap percent is null without a zone target", () => {
    assert.equal(zoneOverlapPercent([0, 0, 0, 0, 0], [10, 0, 0, 0, 0]), null);
  });

  it("overlap is bounded at 100 when actual exceeds target", () => {
    assert.equal(zoneOverlapPercent([60, 0, 0, 0, 0], [600, 0, 0, 0, 0]), 100);
  });

  it("deltas are actual minus target and arrays add elementwise", () => {
    assert.deepEqual(zoneDeltas([60, 30], [45, 40]), [-15, 10]);
    assert.deepEqual(addZoneArrays([1, 2, 3], [4, 5]), [5, 7, 3]);
  });
});
