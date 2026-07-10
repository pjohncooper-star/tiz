import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, format, subDays } from "date-fns";
import type { CalendarLinkedActivity, CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  DEFAULT_WORKOUT_SHADING,
  isWorkoutShadingEligible,
  resolveCompletedMetricPillTone,
  resolveSessionShadingTone,
  sessionCardClassName,
} from "@/lib/plan/workout-shading";

function linkedActivity(
  overrides: Partial<CalendarLinkedActivity> = {}
): CalendarLinkedActivity {
  return {
    id: "act-1",
    name: "Morning run",
    startTime: new Date().toISOString(),
    durationSeconds: 3600,
    elapsedSeconds: 3600,
    movingSeconds: 3500,
    distanceMeters: 10000,
    zoneMinutes: 60,
    discipline: "RUN",
    legType: null,
    ...overrides,
  };
}

function session(
  overrides: Partial<CalendarPlannedSession> = {}
): CalendarPlannedSession {
  return {
    id: "session-1",
    scheduledDate: format(new Date(), "yyyy-MM-dd"),
    discipline: "RUN",
    title: "Easy run",
    totalMinutes: 60,
    plannedMinutes: 60,
    distanceMeters: 10000,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: false,
    source: "FLEXIBLE",
    poolSize: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: null,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole: "MODERATE",
    displaySessionRole: "MODERATE",
    ...overrides,
  };
}

describe("isWorkoutShadingEligible", () => {
  it("includes yesterday regardless of completion", () => {
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    assert.equal(
      isWorkoutShadingEligible(session({ scheduledDate: yesterday })),
      true
    );
  });

  it("excludes today when not completed", () => {
    assert.equal(isWorkoutShadingEligible(session()), false);
  });

  it("includes today when linked activity is present", () => {
    assert.equal(
      isWorkoutShadingEligible(session({ linkedActivity: linkedActivity() })),
      true
    );
  });

  it("includes today when manual completion override is set", () => {
    assert.equal(
      isWorkoutShadingEligible(session({ hasCompletedOverride: true })),
      true
    );
  });

  it("excludes future dates", () => {
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    assert.equal(
      isWorkoutShadingEligible(
        session({ scheduledDate: tomorrow, linkedActivity: linkedActivity() })
      ),
      false
    );
  });
});

describe("resolveSessionShadingTone", () => {
  it("returns a tone for today when linked and shading mode is on", () => {
    const tone = resolveSessionShadingTone(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" }
    );
    assert.equal(tone, "green");
  });

  it("returns null for today without completion", () => {
    const tone = resolveSessionShadingTone(
      session(),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" }
    );
    assert.equal(tone, null);
  });
});

describe("resolveCompletedMetricPillTone", () => {
  it("shades duration pill when duration mode is active", () => {
    const tone = resolveCompletedMetricPillTone(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" },
      "duration",
      "BOTH"
    );
    assert.equal(tone, "green");
  });

  it("keeps distance pill gray when duration mode is active", () => {
    const tone = resolveCompletedMetricPillTone(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" },
      "distance",
      "BOTH"
    );
    assert.equal(tone, "gray");
  });

  it("returns gray when shading target is card only", () => {
    const tone = resolveCompletedMetricPillTone(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" },
      "duration",
      "CARD"
    );
    assert.equal(tone, "gray");
  });
});

describe("sessionCardClassName", () => {
  it("uses default linked styling when shading target is metrics only", () => {
    const className = sessionCardClassName(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" },
      "METRICS"
    );
    assert.match(className, /border-zinc-200/);
    assert.doesNotMatch(className, /emerald/);
  });

  it("applies tone classes when shading target includes card", () => {
    const className = sessionCardClassName(
      session({ linkedActivity: linkedActivity() }),
      { ...DEFAULT_WORKOUT_SHADING, RUN: "DURATION" },
      "BOTH"
    );
    assert.match(className, /emerald/);
  });
});
