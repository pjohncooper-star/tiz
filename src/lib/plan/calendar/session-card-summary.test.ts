import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLinkedActivityCardSummary,
  formatLinkedSessionCardLines,
  formatPlannedSessionCardSummary,
} from "@/lib/plan/calendar/session-card-summary";

describe("session card summary", () => {
  it("formats planned summary with duration and metrics", () => {
    assert.equal(
      formatPlannedSessionCardSummary({
        plannedMinutes: 45,
        metricsSummary: "3000 yd",
      }),
      "Planned 45m · 3000 yd"
    );
  });

  it("formats linked activity summary", () => {
    const summary = formatLinkedActivityCardSummary({
      id: "a1",
      name: "Morning swim",
      startTime: "2026-07-01T07:02:00.000Z",
      durationSeconds: 3720,
      elapsedSeconds: 3720,
      movingSeconds: null,
      distanceMeters: 3200,
      zoneMinutes: 0,
      discipline: "SWIM",
      legType: null,
    });
    assert.match(summary, /^Done .+ · 1h 2m$/);
  });

  it("returns planned and completed lines for linked sessions", () => {
    const lines = formatLinkedSessionCardLines({
      id: "s1",
      scheduledDate: "2026-07-01",
      discipline: "SWIM",
      title: "Swim",
      totalMinutes: 45,
      plannedMinutes: 45,
      distanceMeters: 2743,
      zoneMinutes: {},
      stepCount: 0,
      metricsSummary: "3000 yd",
      zoneAllocationMissing: false,
      source: "FLEXIBLE",
      poolSize: "SCY",
      multisportGroupId: null,
      sessionIndex: null,
      estimatedDurationMinutes: null,
      linkedActivity: {
        id: "a1",
        name: "Morning swim",
        startTime: "2026-07-01T07:02:00.000Z",
        durationSeconds: 3720,
        elapsedSeconds: 3720,
        movingSeconds: null,
        distanceMeters: 3200,
        zoneMinutes: 0,
        discipline: "SWIM",
        legType: null,
      },
      hasCompletedOverride: false,
      completedDurationMinutes: null,
      completedDistanceMeters: null,
      completedTargetSpeedMps: null,
      completedTargetPaceSeconds: null,
      completedZones: null,
      workoutProfile: null,
    });
    assert.equal(lines[0], "Planned 45m · 3000 yd");
    assert.match(lines[1]!, /^Done .+ · 1h 2m$/);
  });
});
