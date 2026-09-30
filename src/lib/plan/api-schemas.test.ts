import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createWorkoutComponentSchema,
  createSimpleSeasonSchema,
  simplePhaseSchema,
} from "@/lib/plan/api-schemas";
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

describe("simplePhaseSchema planning units", () => {
  const phase = {
    name: "Base",
    color: "#38bdf8",
    phaseKind: "BASE",
    startWeekIndex: 0,
    endWeekIndex: 3,
    rampEnabled: { swim: true, bike: true, run: true },
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 3,
    runSessionsPerWeek: 4,
    strengthSessionsPerWeek: 0,
    swimIntenseDaysPerWeek: 0,
    bikeIntenseDaysPerWeek: 0,
    runIntenseDaysPerWeek: 0,
  };

  it("accepts phase overrides and empty values", () => {
    const withOverrides = simplePhaseSchema.safeParse({
      ...phase,
      runPlanningMode: "DISTANCE",
      runReferencePaceSeconds: 300,
      swimPlanningMode: null,
      swimReferencePaceSeconds: null,
    });
    assert.equal(withOverrides.success, true);
    assert.equal(simplePhaseSchema.safeParse(phase).success, true);
  });

  it("rejects an unknown planning unit and a non-positive pace", () => {
    assert.equal(simplePhaseSchema.safeParse({ ...phase, runPlanningMode: "MILES" }).success, false);
    assert.equal(
      simplePhaseSchema.safeParse({ ...phase, runReferencePaceSeconds: 0 }).success,
      false
    );
  });
});
