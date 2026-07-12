import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOCUS_TIZ_PRESETS } from "./constants";
import { normalizeZoneSplitPercents } from "./phase-zone-defaults";
import {
  boundariesFromPercents,
  clampBoundaryDrag,
  percentsFromBoundaries,
  zonePercentsArray,
} from "./zone-split-boundaries";

describe("zone-split-boundaries", () => {
  it("round-trips percents through boundaries", () => {
    const original = normalizeZoneSplitPercents(FOCUS_TIZ_PRESETS.THRESHOLD);
    const roundTrip = percentsFromBoundaries(boundariesFromPercents(original));
    assert.deepEqual(zonePercentsArray(roundTrip), zonePercentsArray(original));
  });

  it("builds equal fifths boundaries", () => {
    const boundaries = boundariesFromPercents({
      z1: 20,
      z2: 20,
      z3: 20,
      z4: 20,
      z5: 20,
    });
    assert.deepEqual(boundaries, [20, 40, 60, 80]);
  });

  it("maps boundaries to zone percents", () => {
    const percents = percentsFromBoundaries([75, 95, 99, 99.5]);
    assert.equal(Math.round(percents.z1), 75);
    assert.equal(Math.round(percents.z2), 20);
    assert.equal(Math.round(percents.z3), 4);
    assert.ok(Math.abs(percents.z4 - 0.5) < 0.1);
    assert.ok(Math.abs(percents.z5 - 0.5) < 0.1);
  });

  it("clamps drag so handles cannot cross", () => {
    const boundaries: [number, number, number, number] = [50, 70, 85, 95];
    const next = clampBoundaryDrag(1, 40, boundaries, 1);
    assert.ok(next[1]! >= next[0]! + 1);
    assert.ok(next[1]! <= next[2]! - 1);
    assert.equal(next[1], 51);
  });

  it("enforces minimum zone width when dragging", () => {
    const boundaries: [number, number, number, number] = [80, 90, 95, 98];
    const next = clampBoundaryDrag(0, 97, boundaries, 1);
    assert.ok(next[0] <= 96);
    assert.ok(next[1]! - next[0]! >= 1);
    assert.ok(next[2]! - next[1]! >= 1);
    assert.ok(next[3]! - next[2]! >= 1);
    assert.ok(100 - next[3]! >= 1);
  });

  it("handles all-Z1 distribution", () => {
    const percents = percentsFromBoundaries([100, 100, 100, 100]);
    assert.equal(Math.round(percents.z1), 100);
    assert.equal(Math.round(percents.z2), 0);
  });
});
