import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergePaletteIntoTree,
  resolveComponentSteps,
} from "@/lib/workout/component-library";
import { defaultLeafStep, WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";

describe("resolveComponentSteps", () => {
  const base = {
    steps: { version: WORKOUT_TREE_VERSION, nodes: [{ ...defaultLeafStep(), notes: "base" }] },
    progressionSteps: [
      {
        id: "prog-1",
        steps: { version: WORKOUT_TREE_VERSION, nodes: [{ ...defaultLeafStep(), notes: "variant" }] },
      },
    ],
  };

  it("returns base steps when no progression id", () => {
    const nodes = resolveComponentSteps(base);
    assert.equal(nodes[0]?.notes, "base");
  });

  it("returns progression steps when id provided", () => {
    const nodes = resolveComponentSteps(base, "prog-1");
    assert.equal(nodes[0]?.notes, "variant");
  });
});

describe("mergePaletteIntoTree", () => {
  it("concatenates nodes in order", () => {
    const a = [{ ...defaultLeafStep(), notes: "a" }];
    const b = [{ ...defaultLeafStep(), notes: "b" }];
    const merged = mergePaletteIntoTree([a, b]);
    assert.equal(merged.nodes.length, 2);
    assert.equal(merged.nodes[0]?.notes, "a");
    assert.equal(merged.nodes[1]?.notes, "b");
  });
});
