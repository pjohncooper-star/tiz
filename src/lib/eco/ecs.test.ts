import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ecsLabel,
  formatEcsDisplay,
  isValidEcs,
  normalizeEcs,
  sumEcsInRange,
  sumLoggedEcs,
} from "@/lib/eco/ecs";

describe("ecs", () => {
  it("accepts 0–5 half-steps only", () => {
    assert.equal(isValidEcs(0), true);
    assert.equal(isValidEcs(2.5), true);
    assert.equal(isValidEcs(5), true);
    assert.equal(isValidEcs(0.25), false);
    assert.equal(isValidEcs(6), false);
    assert.equal(isValidEcs(-1), false);
    assert.equal(isValidEcs(NaN), false);
    assert.equal(isValidEcs("2" as unknown), false);
  });

  it("normalizes to nearest half-step", () => {
    assert.equal(normalizeEcs(2.49), 2.5);
    assert.equal(normalizeEcs(2.1), 2);
    assert.equal(normalizeEcs(9), null);
  });

  it("labels daily load types", () => {
    assert.equal(ecsLabel(0), "Rest");
    assert.equal(ecsLabel(2), "Medium");
    assert.equal(ecsLabel(5), "Maximal");
    assert.match(formatEcsDisplay(2.5), /2\.5/);
  });

  it("sums week ECS with gaps as zero for range helper", () => {
    const points = [
      { date: "2026-06-09", ecs: 2 },
      { date: "2026-06-11", ecs: 3 },
      { date: "2026-06-15", ecs: 1 }, // outside week
    ];
    assert.equal(sumEcsInRange(points, "2026-06-09", "2026-06-15"), 6);
    assert.equal(sumLoggedEcs(points.slice(0, 2)), 5);
  });
});
