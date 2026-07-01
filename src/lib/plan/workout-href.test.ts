import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workoutHref } from "@/lib/plan/workout-href";

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
