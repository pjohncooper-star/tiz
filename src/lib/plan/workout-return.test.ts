import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarWeekReturnHref,
  resolveWorkoutReturnHref,
  workoutReturnHrefFromStartTime,
  workoutReturnLabel,
} from "@/lib/plan/workout-return";

describe("workoutReturnHrefFromStartTime", () => {
  it("returns calendar week for activity start time", () => {
    assert.equal(
      workoutReturnHrefFromStartTime("2026-03-15T10:00:00.000Z"),
      "/calendar?week=2026-03-09"
    );
  });
});

describe("calendarWeekReturnHref", () => {
  it("normalizes week start to Monday", () => {
    assert.equal(calendarWeekReturnHref("2026-03-11"), "/calendar?week=2026-03-09");
  });
});

describe("resolveWorkoutReturnHref", () => {
  it("allows calendar return paths when calendar is enabled", () => {
    const prev = process.env.FEATURE_PLANNING_CALENDAR;
    process.env.FEATURE_PLANNING_CALENDAR = "true";
    try {
      assert.equal(resolveWorkoutReturnHref("/calendar?week=2026-03-09"), "/calendar?week=2026-03-09");
    } finally {
      if (prev === undefined) delete process.env.FEATURE_PLANNING_CALENDAR;
      else process.env.FEATURE_PLANNING_CALENDAR = prev;
    }
  });

  it("falls back to dashboard for unknown paths", () => {
    assert.equal(resolveWorkoutReturnHref("/settings"), "/dashboard");
  });
});

describe("workoutReturnLabel", () => {
  it("labels calendar paths", () => {
    assert.equal(workoutReturnLabel("/calendar?week=2026-03-09"), "calendar");
  });

  it("labels plan paths", () => {
    assert.equal(workoutReturnLabel("/plan/library"), "plan");
  });

  it("labels dashboard", () => {
    assert.equal(workoutReturnLabel("/dashboard"), "dashboard");
  });
});
