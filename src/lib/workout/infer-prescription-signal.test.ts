import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferSignalFromWorkoutNodes } from "@/lib/workout/infer-prescription-signal";
import type { WorkoutNode } from "@/lib/workout/workout-tree";

describe("inferSignalFromWorkoutNodes", () => {
  it("returns null for empty tree", () => {
    assert.equal(inferSignalFromWorkoutNodes([], "BIKE"), null);
  });

  it("returns POWER for bike watt targets", () => {
    const nodes: WorkoutNode[] = [
      {
        kind: "repeat",
        repeatCount: 4,
        children: [
          {
            kind: "step",
            intensity: "interval",
            duration: { type: "time", value: 300 },
            target: { signal: "power", mode: "value", value: 250 },
          },
          {
            kind: "step",
            intensity: "recovery",
            duration: { type: "time", value: 180 },
            target: { signal: "power", mode: "value", value: 150 },
          },
        ],
      },
    ];
    assert.equal(inferSignalFromWorkoutNodes(nodes, "BIKE"), "POWER");
  });

  it("returns HEART_RATE for HR-only steps", () => {
    const nodes: WorkoutNode[] = [
      {
        kind: "step",
        intensity: "active",
        duration: { type: "time", value: 1800 },
        target: { signal: "heart_rate", mode: "zone", zone: 2 },
      },
    ];
    assert.equal(inferSignalFromWorkoutNodes(nodes, "BIKE"), "HEART_RATE");
    assert.equal(inferSignalFromWorkoutNodes(nodes, "RUN"), "HEART_RATE");
  });

  it("returns PACE for run pace steps", () => {
    const nodes: WorkoutNode[] = [
      {
        kind: "step",
        intensity: "active",
        duration: { type: "time", value: 1800 },
        target: { signal: "pace", mode: "zone", zone: 2 },
      },
    ];
    assert.equal(inferSignalFromWorkoutNodes(nodes, "RUN"), "PACE");
  });

  it("prefers POWER over HR on mixed bike trees", () => {
    const nodes: WorkoutNode[] = [
      {
        kind: "step",
        intensity: "warmup",
        duration: { type: "time", value: 600 },
        target: { signal: "heart_rate", mode: "zone", zone: 2 },
      },
      {
        kind: "step",
        intensity: "interval",
        duration: { type: "time", value: 300 },
        target: { signal: "power", mode: "value", value: 250 },
      },
    ];
    assert.equal(inferSignalFromWorkoutNodes(nodes, "BIKE"), "POWER");
  });
});
