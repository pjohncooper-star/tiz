import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectRelativePaceRequirements,
  freezeRelativeTargetsInTree,
  formatMissingRelativeIntensity,
  missingRelativeIntensity,
  resolveRelativePercentTarget,
} from "@/lib/workout/relative-intensity";
import type { WorkoutTreeDocument } from "@/lib/workout/workout-tree";

const relativeTree: WorkoutTreeDocument = {
  version: 2,
  nodes: [
    {
      kind: "step",
      intensity: "warmup",
      duration: { type: "time", value: 600 },
      target: { signal: "pace", mode: "relative", ref: "threshold" },
    },
    {
      kind: "step",
      intensity: "interval",
      duration: { type: "time", value: 180 },
      target: { signal: "pace", mode: "relative", ref: "5k", pct: 95 },
    },
    {
      kind: "step",
      intensity: "active",
      duration: { type: "time", value: 1200 },
      target: { signal: "power", mode: "relative", pct: 130 },
    },
  ],
};

describe("relative intensity helpers", () => {
  it("collects unique pace refs", () => {
    const reqs = collectRelativePaceRequirements(relativeTree.nodes);
    assert.equal(reqs.length, 2);
    assert.ok(reqs.some((r) => r.ref === "threshold"));
    assert.ok(reqs.some((r) => r.ref === "5k"));
  });

  it("reports missing anchors and FTP", () => {
    const missing = missingRelativeIntensity(relativeTree.nodes, {
      thresholdPaceSeconds: null,
      racePaces: {},
      ftpWatts: null,
    });
    assert.equal(missing.pace.length, 2);
    assert.equal(missing.needsFtp, true);
    const lines = formatMissingRelativeIntensity(missing);
    assert.ok(lines.some((l) => /threshold/i.test(l)));
    assert.ok(lines.some((l) => /5k/i.test(l)));
    assert.ok(lines.some((l) => /FTP/i.test(l)));
  });

  it("freezes relative pace and power when anchors present", () => {
    const frozen = freezeRelativeTargetsInTree(relativeTree, {
      thresholdPaceSeconds: 300,
      racePaces: { "5k": 270 },
      ftpWatts: 250,
    });
    const steps = frozen.nodes.filter((n) => n.kind === "step");
    assert.equal(steps[0]!.target.mode, "value");
    assert.equal(steps[0]!.target.value, 300);
    assert.equal(steps[0]!.targetPaceSeconds, 300);
    assert.equal(steps[1]!.target.mode, "value");
    assert.ok(
      Math.abs((steps[1]!.targetPaceSeconds ?? 0) - (270 * 100) / 95) < 1e-6
    );
    assert.equal(steps[2]!.target.mode, "value");
    assert.equal(steps[2]!.target.value, 325);
  });

  it("resolves relative percent of FTP / max HR", () => {
    assert.equal(
      resolveRelativePercentTarget(
        { signal: "power", mode: "relative", pct: 130 },
        { ftpWatts: 200 }
      ),
      260
    );
    assert.equal(
      resolveRelativePercentTarget(
        { signal: "heart_rate", mode: "relative", pct: 80 },
        { maxHeartRateBpm: 190 }
      ),
      152
    );
    assert.equal(
      resolveRelativePercentTarget(
        { signal: "power", mode: "relative", pct: 130 },
        { ftpWatts: null }
      ),
      null
    );
  });
});
