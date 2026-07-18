import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import {
  enrichDistanceFlatStep,
  estimateDistanceStepDurationSeconds,
} from "@/lib/workout/distance-duration";
import { paceSecondsAtZoneMidpoint } from "@/lib/workout/zone-pace";
import {
  leafToFlatPlanningStep,
  rollupTreeToZoneMinutes,
  type LeafStep,
} from "@/lib/workout/workout-tree";
import { workoutZoneRollup } from "@/lib/plan/rollup";

function distanceLeaf(zone: number, meters: number): LeafStep {
  return {
    kind: "step",
    intensity: "active",
    duration: { type: "distance", value: meters },
    target: { signal: "pace", mode: "zone", zone },
  };
}

describe("distance step TiZ", () => {
  const boundaries = zoneBoundariesFor("RUN", "PACE");
  const threshold = 300; // 5:00/km

  it("estimates duration for a distance flat step at zone mid pace", () => {
    const sec = estimateDistanceStepDurationSeconds(
      { distanceMeters: 1000, targetZone: 2, targetPaceSeconds: undefined },
      { discipline: "RUN", thresholdPaceSeconds: threshold, zoneBoundaries: boundaries }
    );
    const expectedPace = paceSecondsAtZoneMidpoint(2, threshold, boundaries);
    assert.ok(Math.abs(sec - expectedPace) < 0.5);
  });

  it("enriches leafToFlatPlanningStep with non-zero minutes", () => {
    const flat = leafToFlatPlanningStep(distanceLeaf(2, 1000), {
      discipline: "RUN",
      thresholdPaceSeconds: threshold,
      zoneBoundaries: boundaries,
    });
    assert.ok(flat);
    assert.ok((flat!.durationMinutes ?? 0) > 0);
    assert.ok((flat!.durationSeconds ?? 0) > 0);
  });

  it("includes distance steps in rollupTreeToZoneMinutes", () => {
    const tree = {
      version: 2 as const,
      nodes: [distanceLeaf(3, 2000)],
    };
    const zones = rollupTreeToZoneMinutes(tree, {
      discipline: "RUN",
      thresholdPaceSeconds: threshold,
      zoneBoundaries: boundaries,
    });
    assert.ok((zones["3"] ?? 0) > 0);
  });

  it("includes distance steps in workoutZoneRollup for Pool Week TiZ path", () => {
    const tree = {
      version: 2 as const,
      nodes: [distanceLeaf(2, 1000), distanceLeaf(4, 1000)],
    };
    const rollup = workoutZoneRollup("RUN", tree, {
      discipline: "RUN",
      thresholdPaceSeconds: threshold,
      zoneBoundaries: boundaries,
    });
    assert.ok((rollup.zones["RUN-2"] ?? 0) > 0);
    assert.ok((rollup.zones["RUN-4"] ?? 0) > 0);
    assert.ok(rollup.durationMinutes > 0);
  });

  it("leaves time-based steps unchanged", () => {
    const leaf: LeafStep = {
      kind: "step",
      intensity: "active",
      duration: { type: "time", value: 600 },
      target: { signal: "pace", mode: "zone", zone: 2 },
    };
    const flat = leafToFlatPlanningStep(leaf, {
      discipline: "RUN",
      thresholdPaceSeconds: threshold,
      zoneBoundaries: boundaries,
    });
    assert.equal(flat?.durationSeconds, 600);
    assert.equal(flat?.durationMinutes, 10);
  });

  it("does not invent duration for bike distance without pace", () => {
    const flat = enrichDistanceFlatStep(
      {
        type: "steady",
        durationMinutes: 0,
        durationSeconds: 0,
        targetZone: 3,
        distanceMeters: 10000,
      },
      { discipline: undefined, thresholdPaceSeconds: threshold }
    );
    assert.equal(flat.durationMinutes, 0);
  });
});
