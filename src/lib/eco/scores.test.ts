import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignEcoZone, ecoBoundariesForSignal } from "./boundaries";
import {
  computeSessionEcos,
  ecosForFlatSession,
  ecoTransitionBump,
} from "./compute";
import {
  ECO_ZONE_SCORES,
  ecoDisciplineFactor,
  weightedEcoFromZoneMinutes,
} from "./scores";
import { sumEcos } from "./rollup";
import type { EcoStreams } from "./compute";

describe("ECO scores", () => {
  it("uses published zone scores 1–50", () => {
    assert.deepEqual([...ECO_ZONE_SCORES], [1, 2, 3, 4, 6, 9, 15, 50]);
  });

  it("matches literature flat-session examples", () => {
    // 60′ run zone 1 → 60 × 1 × 1 = 60
    assert.equal(ecosForFlatSession(60, 1, "RUN"), 60);
    // 120′ bike zone 1 → 120 × 1 × 0.5 = 60
    assert.equal(ecosForFlatSession(120, 1, "BIKE"), 60);
    // 20′ swim zone 1 → 20 × 1 × 0.75 = 15
    assert.equal(ecosForFlatSession(20, 1, "SWIM"), 15);
  });

  it("weights mixed zones then applies discipline factor", () => {
    const zones = { 1: 20, 4: 20 };
    // (20*1 + 20*4) * 0.75 = 100 * 0.75 = 75
    assert.equal(weightedEcoFromZoneMinutes(zones, 0.75), 75);
  });

  it("skips strength", () => {
    assert.equal(ecoDisciplineFactor("STRENGTH"), null);
    assert.equal(ecosForFlatSession(30, 1, "STRENGTH"), null);
  });
});

describe("ECO transition bumps", () => {
  it("adds swim→bike and bike→run bumps", () => {
    assert.equal(
      ecoTransitionBump({ discipline: "BIKE", priorLegTypes: ["SWIM"] }),
      0.1
    );
    assert.equal(
      ecoTransitionBump({ discipline: "RUN", priorLegTypes: ["SWIM", "BIKE"] }),
      0.15
    );
    assert.equal(ecoTransitionBump({ discipline: "SWIM", priorLegTypes: [] }), 0);
  });
});

describe("ECO zone assignment", () => {
  it("assigns power relative to FTP", () => {
    const boundaries = ecoBoundariesForSignal("POWER");
    assert.equal(assignEcoZone(100, 200, boundaries, "POWER"), 1); // 50%
    assert.equal(assignEcoZone(190, 200, boundaries, "POWER"), 4); // 95%
    assert.equal(assignEcoZone(230, 200, boundaries, "POWER"), 6); // 115%
    assert.equal(assignEcoZone(400, 200, boundaries, "POWER"), 8); // 200%
  });

  it("assigns pace relative to threshold pace (faster = higher zone)", () => {
    const boundaries = ecoBoundariesForSignal("PACE");
    const threshold = 300; // sec/km
    assert.equal(assignEcoZone(500, threshold, boundaries, "PACE"), 1); // ~60% speed
    assert.equal(assignEcoZone(300, threshold, boundaries, "PACE"), 5); // at / just above AnT
    assert.equal(assignEcoZone(240, threshold, boundaries, "PACE"), 7); // 125% speed
  });
});

describe("ECO session compute", () => {
  it("scores a constant power ride", () => {
    const n = 60;
    const streams: EcoStreams = {
      time: { data: Array.from({ length: n }, (_, i) => i) },
      watts: { data: Array.from({ length: n }, () => 100) },
    };
    const result = computeSessionEcos({
      streams,
      signal: "POWER",
      thresholdValue: 200,
      discipline: "BIKE",
      durationSeconds: 3600,
    });
    assert.ok(result);
    // ~60 min in ECO zone 1 × score 1 × 0.5 ≈ 30
    assert.ok(result!.ecos > 25 && result!.ecos < 35);
    assert.ok((result!.ecoZoneMinutes[1] ?? 0) > 50);
  });
});

describe("ECO rollup", () => {
  it("sums finite values", () => {
    assert.equal(sumEcos([10, null, 5, undefined]), 15);
  });
});
