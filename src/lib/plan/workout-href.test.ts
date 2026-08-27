import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newWorkoutHref, workoutHref, workoutHrefForResolvedActivity } from "@/lib/plan/workout-href";

describe("workoutHref", () => {
  it("returns base path without returnTo", () => {
    assert.equal(workoutHref("session-1"), "/workouts/session-1");
  });

  it("appends encoded returnTo query", () => {
    assert.equal(
      workoutHref("session-1", { returnTo: "/calendar?week=2026-01-05" }),
      "/workouts/session-1?returnTo=%2Fcalendar%3Fweek%3D2026-01-05"
    );
  });
});

describe("newWorkoutHref", () => {
  it("includes the calendar date", () => {
    assert.equal(newWorkoutHref("2026-08-17"), "/workouts/new?date=2026-08-17");
  });

  it("appends encoded returnTo query", () => {
    assert.equal(
      newWorkoutHref("2026-08-17", { returnTo: "/calendar" }),
      "/workouts/new?date=2026-08-17&returnTo=%2Fcalendar"
    );
  });
});

describe("workoutHrefForResolvedActivity", () => {
  it("uses the calendar session page when a session id is known", () => {
    assert.equal(
      workoutHrefForResolvedActivity("activity-1", "session-1", { returnTo: "/dashboard" }),
      "/workouts/session-1?returnTo=%2Fdashboard"
    );
  });

  it("falls back to the activity redirect URL when no session is known", () => {
    assert.equal(
      workoutHrefForResolvedActivity("activity-1", null, { returnTo: "/dashboard" }),
      "/activities/activity-1?returnTo=%2Fdashboard"
    );
  });
});
