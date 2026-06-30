import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFitStepManifest } from "@/lib/workout/fit-step-manifest";
import { parseWorkoutTree } from "@/lib/workout/workout-tree";
import {
  buildStepExecutionRows,
  collectFitMessageIndices,
} from "./workout-execution";

const openTarget = { signal: "power" as const, mode: "zone" as const, zone: 2 };

const tempoRepeatWorkout = {
  version: 2,
  nodes: [
    {
      kind: "step",
      intensity: "warmup",
      duration: { type: "time", value: 540 },
      target: openTarget,
    },
    {
      kind: "repeat",
      repeatCount: 4,
      children: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 360 },
          target: { signal: "power", mode: "zone", zone: 4 },
        },
        {
          kind: "step",
          intensity: "recovery",
          duration: { type: "time", value: 120 },
          target: openTarget,
        },
      ],
    },
  ],
};

const garminTempoLaps = [0, 2, 3, 2, 3, 2, 3, 2, 3, 3].map((wktStepIndex, i) => {
  const elapsed = [549, 360, 120, 360, 120, 360, 120, 42, 149, 149][i];
  return { wktStepIndex, elapsedSeconds: elapsed };
});

describe("buildStepExecutionRows", () => {
  it("pairs laps per repeat round instead of summing by wktStepIndex", () => {
    const rows = buildStepExecutionRows(tempoRepeatWorkout, garminTempoLaps, "BIKE");
    assert.ok(rows);
    assert.equal(rows.length, 9);

    const warmUp = rows[0];
    assert.equal(warmUp.label, "Warm up");
    assert.equal(warmUp.actualSeconds, 549);
    assert.equal(warmUp.groupLabel, undefined);

    const interval1Bike = rows[1];
    assert.equal(interval1Bike.label, "Bike");
    assert.equal(interval1Bike.groupLabel, "Interval 1");
    assert.equal(interval1Bike.actualSeconds, 360);

    const interval4Bike = rows[7];
    assert.equal(interval4Bike.label, "Bike");
    assert.equal(interval4Bike.groupLabel, "Interval 4");
    assert.equal(interval4Bike.actualSeconds, 42);
    assert.notEqual(interval4Bike.actualSeconds, 360 * 4);

    const interval4Rest = rows[8];
    assert.equal(interval4Rest.label, "Rest");
    assert.equal(interval4Rest.actualSeconds, 298);
  });

  it("pairs laps chronologically when wkt indices repeat across rounds", () => {
    const rows = buildStepExecutionRows(tempoRepeatWorkout, garminTempoLaps, "BIKE");
    assert.ok(rows);
    assert.equal(rows.filter((r) => r.actualSeconds != null).length, 9);
  });

  it("normalizes string lap metrics from stored JSON", () => {
    const rows = buildStepExecutionRows(
      tempoRepeatWorkout,
      garminTempoLaps.map((lap) => ({
        wktStepIndex: String(lap.wktStepIndex) as unknown as number,
        elapsedSeconds: String(lap.elapsedSeconds) as unknown as number,
      })),
      "BIKE"
    );
    assert.ok(rows);
    assert.equal(rows[7].actualSeconds, 42);
  });

  it("falls back to manual laps positionally when wktStepIndex is absent", () => {
    const simpleWorkout = {
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "warmup",
          duration: { type: "time", value: 300 },
          target: openTarget,
        },
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 600 },
          target: openTarget,
        },
      ],
    };
    const manualLaps = [
      { lapTrigger: "manual", elapsedSeconds: 310 },
      { lapTrigger: "manual", elapsedSeconds: 590 },
    ];
    const rows = buildStepExecutionRows(simpleWorkout, manualLaps, "RUN");
    assert.ok(rows);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].actualSeconds, 310);
    assert.equal(rows[1].actualSeconds, 590);
  });
});

describe("FIT message_index manifest", () => {
  it("assigns indices that include repeat control steps", () => {
    const tree = parseWorkoutTree(tempoRepeatWorkout);
    const indices = collectFitMessageIndices(tree.nodes);
    assert.deepEqual(indices, [0, 1, 2, 3]);

    const manifest = buildFitStepManifest(tree.nodes, "BIKE");
    assert.equal(manifest.length, 4);
    assert.equal(manifest[0].messageIndex, 0);
    assert.equal(manifest[0].kind, "leaf");
    assert.equal(manifest[1].messageIndex, 1);
    assert.equal(manifest[1].kind, "repeat");
    assert.equal(manifest[2].messageIndex, 2);
    assert.equal(manifest[2].label, "Bike");
    assert.equal(manifest[3].messageIndex, 3);
    assert.equal(manifest[3].label, "Rest");
  });
});
