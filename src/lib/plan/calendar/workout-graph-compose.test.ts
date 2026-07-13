import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeSegmentNodes,
  templatesForSegmentColumn,
  type GraphSegment,
} from "./workout-graph-compose";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import type { WorkoutNode } from "@/lib/workout/workout-tree";

const warm: WorkoutNode = {
  kind: "step",
  intensity: "warmup",
  duration: { type: "time", value: 600 },
  target: { signal: "power", mode: "zone", zone: 2 },
};

const main: WorkoutNode = {
  kind: "step",
  intensity: "interval",
  duration: { type: "time", value: 180 },
  target: { signal: "power", mode: "zone", zone: 4 },
};

describe("mergeSegmentNodes", () => {
  it("concatenates cloned nodes from each segment", () => {
    const segments: GraphSegment[] = [
      { id: "1", label: "WU", nodes: [warm] },
      { id: "2", label: "Main", nodes: [main] },
    ];
    const merged = mergeSegmentNodes(segments);
    assert.equal(merged.length, 2);
    assert.ok(merged[0]!.kind === "step");
    assert.ok(merged[1]!.kind === "step");
    assert.equal(merged[0]!.intensity, "warmup");
    assert.equal(merged[1]!.intensity, "interval");
    // mutate clone should not affect source
    merged[0]!.duration = { type: "time", value: 1 };
    assert.ok(segments[0]!.nodes[0]!.kind === "step");
    assert.equal(
      segments[0]!.nodes[0]!.duration.type === "time"
        ? segments[0]!.nodes[0]!.duration.value
        : 0,
      600
    );
  });
});

describe("templatesForSegmentColumn", () => {
  const tree: FolderTreeNode[] = [
    {
      id: "wu",
      name: "Warm",
      folderKind: "WARM_UP",
      discipline: "RUN",
      sortOrder: 0,
      parentFolderId: null,
      lastCompletedAt: null,
      lastCompletedTemplate: null,
      children: [],
      workouts: [{ id: "t1", name: "10' Z2", discipline: "RUN", sortOrder: 0 }],
    },
    {
      id: "lib",
      name: "Library",
      folderKind: "LIBRARY",
      discipline: "RUN",
      sortOrder: 1,
      parentFolderId: null,
      lastCompletedAt: null,
      lastCompletedTemplate: null,
      children: [],
      workouts: [{ id: "t2", name: "Threshold", discipline: "RUN", sortOrder: 0 }],
    },
  ];

  it("filters warm-up column to WARM_UP folders", () => {
    const list = templatesForSegmentColumn(tree, "WARM_UP");
    assert.equal(list.length, 1);
    assert.equal(list[0]!.templateId, "t1");
  });

  it("includes library templates in main set column", () => {
    const list = templatesForSegmentColumn(tree, "MAIN_SET");
    assert.equal(list.length, 1);
    assert.equal(list[0]!.templateId, "t2");
  });
});
