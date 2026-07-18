import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import {
  paceSecondsAtZoneMidpoint,
  zoneMidSpeedPct,
  Z5_SPEED_PCT,
} from "@/lib/workout/zone-pace";

describe("zoneMidSpeedPct", () => {
  it("uses mirror-width midpoint for Z1 and fixed 120% for Z5 on default run boundaries", () => {
    const boundaries = zoneBoundariesFor("RUN", "PACE");
    const sorted = [...boundaries].sort((a, b) => a - b);
    const z1Top = sorted[0]!;
    const z2Top = sorted[1]!;
    const z2Width = z2Top - z1Top;
    const expectedZ1 = (z1Top - z2Width + z1Top) / 2;

    assert.ok(Math.abs(zoneMidSpeedPct(1, boundaries) - expectedZ1) < 0.01);
    assert.equal(zoneMidSpeedPct(5, boundaries), Z5_SPEED_PCT);
  });

  it("uses true midpoints for Z2–Z4", () => {
    const boundaries = zoneBoundariesFor("RUN", "PACE");
    const sorted = [...boundaries].sort((a, b) => a - b);
    assert.ok(
      Math.abs(zoneMidSpeedPct(2, boundaries) - (sorted[0]! + sorted[1]!) / 2) < 0.01
    );
    assert.ok(
      Math.abs(zoneMidSpeedPct(3, boundaries) - (sorted[1]! + sorted[2]!) / 2) < 0.01
    );
    assert.ok(
      Math.abs(zoneMidSpeedPct(4, boundaries) - (sorted[2]! + sorted[3]!) / 2) < 0.01
    );
  });

  it("respects custom boundaries for Z1 mirror and keeps Z5 at 120%", () => {
    // User-like cutoffs as speed %: ~90, 97, 100, 110, soft 120
    const boundaries = [90.01, 96.99, 100, 110.01, 120.05];
    const z1 = zoneMidSpeedPct(1, boundaries);
    assert.ok(z1 > 83 && z1 < 90);
    assert.equal(zoneMidSpeedPct(5, boundaries), 120);
  });
});

describe("paceSecondsAtZoneMidpoint", () => {
  it("converts threshold pace via mid speed %", () => {
    const boundaries = [90, 97, 100, 110];
    const thr = 435; // 7:15 /mi-equivalent seconds for unit test
    const z5 = paceSecondsAtZoneMidpoint(5, thr, boundaries);
    assert.ok(Math.abs(z5 - (thr * 100) / 120) < 0.01);
  });
});
