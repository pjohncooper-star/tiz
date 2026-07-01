import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectWorkoutDetailMode } from "@/lib/plan/workout-detail.server";

describe("detectWorkoutDetailMode", () => {
  it("returns planned when nothing is completed", () => {
    assert.equal(
      detectWorkoutDetailMode({
        hasCompleted: false,
        hasStructuredWorkout: true,
        hasPlannedMetrics: true,
        hasNotes: false,
        isDefaultTitle: false,
        source: "TEMPLATE",
      }),
      "planned"
    );
  });

  it("returns completed for activity-only flexible sessions", () => {
    assert.equal(
      detectWorkoutDetailMode({
        hasCompleted: true,
        hasStructuredWorkout: false,
        hasPlannedMetrics: false,
        hasNotes: false,
        isDefaultTitle: true,
        source: "FLEXIBLE",
      }),
      "completed"
    );
  });

  it("returns planned_and_completed when both planned content and completion exist", () => {
    assert.equal(
      detectWorkoutDetailMode({
        hasCompleted: true,
        hasStructuredWorkout: true,
        hasPlannedMetrics: false,
        hasNotes: false,
        isDefaultTitle: true,
        source: "FLEXIBLE",
      }),
      "planned_and_completed"
    );
  });

  it("treats non-flexible sources as planned content", () => {
    assert.equal(
      detectWorkoutDetailMode({
        hasCompleted: true,
        hasStructuredWorkout: false,
        hasPlannedMetrics: false,
        hasNotes: false,
        isDefaultTitle: true,
        source: "RACE",
      }),
      "planned_and_completed"
    );
  });

  it("treats notes as planned content", () => {
    assert.equal(
      detectWorkoutDetailMode({
        hasCompleted: true,
        hasStructuredWorkout: false,
        hasPlannedMetrics: false,
        hasNotes: true,
        isDefaultTitle: true,
        source: "FLEXIBLE",
      }),
      "planned_and_completed"
    );
  });
});
