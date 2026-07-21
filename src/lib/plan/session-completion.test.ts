import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCompletedSnapshotFromSession,
  hasSessionCompletionOverride,
  sessionCompletionRollup,
  validateCompletedZoneAllocation,
} from "./session-completion";
import type { CalendarPlannedSession } from "./calendar/serialize";
import {
  linkedActivityIdsExcludedFromCompletedRollup,
  mergeWeekSummaries,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
} from "./calendar/week-summary";

describe("hasSessionCompletionOverride", () => {
  it("returns false when no completed fields are set", () => {
    assert.equal(hasSessionCompletionOverride({}), false);
  });

  it("returns true when duration is set", () => {
    assert.equal(
      hasSessionCompletionOverride({ completedDurationMinutes: 60 }),
      true
    );
  });

  it("returns true when completed zones are set", () => {
    assert.equal(
      hasSessionCompletionOverride({ completedZones: { "2": 30 } }),
      true
    );
  });
});

describe("buildCompletedSnapshotFromSession", () => {
  it("builds stats and zone minutes from session fields", () => {
    const snapshot = buildCompletedSnapshotFromSession(
      {
        completedDurationMinutes: 60,
        completedDistanceMeters: 25000,
        completedTargetSpeedMps: 8.33,
        completedZones: { "2": 30, "3": 30 },
      },
      "BIKE",
      "METRIC"
    );

    assert.equal(snapshot.canonical?.durationMinutes, 60);
    assert.equal(snapshot.canonical?.distanceMeters, 25000);
    assert.equal(snapshot.zoneMinutes["BIKE-2"], 30);
    assert.equal(snapshot.zoneMinutes["BIKE-3"], 30);
    assert.equal(snapshot.activities.length, 0);
    assert.ok(snapshot.stats.some((s) => s.label === "Duration"));
  });
});

describe("validateCompletedZoneAllocation", () => {
  it("allows integer zone sum within ceiled fractional duration", () => {
    assert.equal(validateCompletedZoneAllocation({ 2: 32 }, 31.483333333333334), null);
  });

  it("rejects zones exceeding duration", () => {
    assert.equal(
      validateCompletedZoneAllocation({ 2: 40, 3: 30 }, 60),
      "Completed zone minutes cannot exceed duration"
    );
  });

  it("allows zones within duration", () => {
    assert.equal(validateCompletedZoneAllocation({ 2: 30 }, 60), null);
  });
});

describe("sessionCompletionRollup", () => {
  it("returns null without override fields", () => {
    assert.equal(
      sessionCompletionRollup({ discipline: "RUN", completedDurationMinutes: null }),
      null
    );
  });

  it("returns rollup for manual completion", () => {
    const rollup = sessionCompletionRollup({
      discipline: "RUN",
      completedDurationMinutes: 45,
      completedDistanceMeters: 10000,
      completedZones: { "2": 45 },
    });
    assert.ok(rollup);
    assert.equal(rollup!.durationMinutes, 45);
    assert.equal(rollup!.distanceMeters, 10000);
    assert.equal(rollup!.zoneMinutes["RUN-2"], 45);
  });
});

function calendarSession(
  overrides: Partial<CalendarPlannedSession> & Pick<CalendarPlannedSession, "id">
): CalendarPlannedSession {
  return {
    id: overrides.id,
    scheduledDate: overrides.scheduledDate ?? "2026-06-16",
    discipline: overrides.discipline ?? "BIKE",
    title: overrides.title ?? "Ride",
    totalMinutes: overrides.totalMinutes ?? 60,
    plannedMinutes: overrides.plannedMinutes ?? 60,
    distanceMeters: overrides.distanceMeters ?? null,
    zoneMinutes: overrides.zoneMinutes ?? {},
    stepCount: overrides.stepCount ?? 0,
    metricsSummary: overrides.metricsSummary ?? null,
    zoneAllocationMissing: overrides.zoneAllocationMissing ?? false,
    source: overrides.source ?? "FLEXIBLE",
    poolSize: overrides.poolSize ?? null,
    multisportGroupId: overrides.multisportGroupId ?? null,
    sessionIndex: overrides.sessionIndex ?? null,
    estimatedDurationMinutes: overrides.estimatedDurationMinutes ?? null,
    linkedActivity: overrides.linkedActivity ?? null,
    hasCompletedOverride: overrides.hasCompletedOverride ?? false,
    completedDurationMinutes: overrides.completedDurationMinutes ?? null,
    completedDistanceMeters: overrides.completedDistanceMeters ?? null,
    completedTargetSpeedMps: overrides.completedTargetSpeedMps ?? null,
    completedTargetPaceSeconds: overrides.completedTargetPaceSeconds ?? null,
    completedZones: overrides.completedZones ?? null,
    workoutProfile: overrides.workoutProfile ?? null,
    sessionRole: overrides.sessionRole ?? "MODERATE",
    displaySessionRole: overrides.displaySessionRole ?? "MODERATE",
    tizSignalOverride: null,
    poolSlotKind: overrides.poolSlotKind ?? null,
  };
}

describe("week completed rollup", () => {
  it("counts manual session completion", () => {
    const summary = summarizeWeekCompletedSessions([
      calendarSession({
        id: "s1",
        completedDurationMinutes: 60,
        completedDistanceMeters: 30000,
        completedZones: { "2": 60 },
        hasCompletedOverride: true,
      }),
    ]);

    assert.equal(summary.total.sessionCount, 1);
    assert.equal(summary.total.plannedMinutes, 60);
    assert.equal(summary.total.distanceMeters, 30000);
    assert.equal(summary.total.zoneMinutes["BIKE-2"], 60);
  });

  it("excludes linked activity when session has overrides", () => {
    const sessions = [
      calendarSession({
        id: "s1",
        hasCompletedOverride: true,
        completedDurationMinutes: 50,
        completedZones: { "3": 50 },
        linkedActivity: {
          id: "act-1",
          name: "FIT ride",
          startTime: "2026-06-16T10:00:00.000Z",
          durationSeconds: 3600,
          elapsedSeconds: 3600,
          movingSeconds: 3500,
          distanceMeters: 40000,
          zoneMinutes: 60,
          discipline: "BIKE",
          legType: null,
        },
      }),
    ];

    const excluded = linkedActivityIdsExcludedFromCompletedRollup(sessions);
    assert.deepEqual([...excluded], ["act-1"]);

    const sessionSummary = summarizeWeekCompletedSessions(sessions);
    const activitySummary = summarizeWeekCompletedActivities(
      [
        {
          discipline: "BIKE",
          durationSeconds: 3600,
          distanceMeters: 40000,
          zoneMinutes: { "BIKE-2": 60 },
        },
      ].filter((a) => !excluded.has("act-1"))
    );
    const merged = mergeWeekSummaries(sessionSummary, activitySummary);

    assert.equal(merged.total.plannedMinutes, 50);
    assert.equal(merged.total.zoneMinutes["BIKE-3"], 50);
    assert.equal(merged.total.zoneMinutes["BIKE-2"], undefined);
  });

  it("keeps activity-only sessions unchanged", () => {
    const activitySummary = summarizeWeekCompletedActivities([
      {
        discipline: "RUN",
        durationSeconds: 2700,
        distanceMeters: 10000,
        zoneMinutes: { "RUN-2": 45 },
      },
    ]);

    assert.equal(activitySummary.total.sessionCount, 1);
    assert.equal(activitySummary.total.plannedMinutes, 45);
    assert.equal(activitySummary.total.zoneMinutes["RUN-2"], 45);
  });
});
