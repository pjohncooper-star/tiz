import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkoutComponentSchema } from "@/lib/plan/api-schemas";
import {
  defaultLeafStep,
  serializeWorkoutTree,
  WORKOUT_TREE_VERSION,
} from "@/lib/workout/workout-tree";

describe("createWorkoutComponentSchema", () => {
  it("accepts a default workout tree payload", () => {
    const tree = {
      version: WORKOUT_TREE_VERSION,
      nodes: [defaultLeafStep()],
    };
    const body = {
      name: "Test",
      discipline: "RUN",
      componentType: "MAIN_SET",
      notes: null,
      steps: serializeWorkoutTree(tree),
    };
    const result = createWorkoutComponentSchema.safeParse(body);
    assert.equal(result.success, true);
  });

  it("rejects missing component type", () => {
    const result = createWorkoutComponentSchema.safeParse({
      name: "Test",
      discipline: "RUN",
      steps: { version: 2, nodes: [defaultLeafStep()] },
    });
    assert.equal(result.success, false);
  });
});
