import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkoutComponentSchema, createSimpleSeasonSchema } from "@/lib/plan/api-schemas";
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

describe("createSimpleSeasonSchema", () => {
  const base = {
    name: "2026 Season",
    startDate: "2026-01-05",
    endDate: "2026-07-05",
  };

  it("defaults seedPhases to empty", () => {
    const result = createSimpleSeasonSchema.safeParse(base);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.seedPhases, "empty");
  });

  it("accepts seedPhases suggested", () => {
    const result = createSimpleSeasonSchema.safeParse({ ...base, seedPhases: "suggested" });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.seedPhases, "suggested");
  });

  it("rejects unknown seedPhases values", () => {
    const result = createSimpleSeasonSchema.safeParse({ ...base, seedPhases: "wizard" });
    assert.equal(result.success, false);
  });
});
