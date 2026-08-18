import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import {
  buildDayStripSessions,
  calendarActivityDateKey,
  matchExtraActivitiesToPlannedSessions,
} from "./day-strip-sessions";

function planned(
  partial: Partial<CalendarPlannedSession> & Pick<CalendarPlannedSession, "id" | "title">
): CalendarPlannedSession {
  return {
    scheduledDate: "2026-08-16",
    scheduledTimeMinutes: null,
    daySortOrder: 0,
    discipline: "RUN",
    totalMinutes: 60,
    plannedMinutes: 60,
    distanceMeters: null,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: false,
    source: "FLEXIBLE",
    poolSize: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: 60,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole: "EASY",
    displaySessionRole: "EASY",
    tizSignalOverride: null,
    poolSlotKind: null,
    ...partial,
  };
}

function activity(
  partial: Partial<CalendarWeekActivity> & Pick<CalendarWeekActivity, "id" | "name">
): CalendarWeekActivity {
  return {
    startTime: "2026-08-16T14:00:00.000Z",
    discipline: "RUN",
    source: "STRAVA",
    signalUsed: null,
    noUsableSignal: false,
    durationSeconds: 3600,
    distanceMeters: 10000,
    zoneMinutes: {},
    ecos: null,
    multisportGroupId: null,
    sessionIndex: null,
    legType: null,
    ...partial,
  };
}

describe("calendarActivityDateKey", () => {
  it("uses the same local day as the planning calendar", () => {
    assert.equal(calendarActivityDateKey("2026-08-16T14:00:00.000Z"), "2026-08-16");
  });
});

describe("matchExtraActivitiesToPlannedSessions", () => {
  it("maps an extra to the closer unlinked session and does not reuse it", () => {
    const map = matchExtraActivitiesToPlannedSessions(
      [
        { id: "easy-file", discipline: "RUN", durationSeconds: 40 * 60, dateKey: "2026-08-16" },
        { id: "long-file", discipline: "RUN", durationSeconds: 90 * 60, dateKey: "2026-08-16" },
      ],
      [
        {
          id: "easy-plan",
          discipline: "RUN",
          scheduledDate: "2026-08-16",
          linkedActivityId: null,
          estimatedDurationMinutes: 40,
        },
        {
          id: "long-plan",
          discipline: "RUN",
          scheduledDate: "2026-08-16",
          linkedActivityId: null,
          estimatedDurationMinutes: 90,
        },
      ]
    );
    assert.equal(map.get("easy-file"), "easy-plan");
    assert.equal(map.get("long-file"), "long-plan");
  });

  it("skips already-linked planned sessions", () => {
    const map = matchExtraActivitiesToPlannedSessions(
      [{ id: "file", discipline: "RUN", durationSeconds: 3600, dateKey: "2026-08-16" }],
      [
        {
          id: "linked",
          discipline: "RUN",
          scheduledDate: "2026-08-16",
          linkedActivityId: "other",
          estimatedDurationMinutes: 60,
        },
      ]
    );
    assert.equal(map.size, 0);
  });
});

describe("buildDayStripSessions", () => {
  it("orders planned sessions like the calendar, not by title", () => {
    const sessions = buildDayStripSessions({
      dateKey: "2026-08-16",
      todayKey: "2026-08-17",
      planned: [
        planned({ id: "late", title: "AAA Run", scheduledTimeMinutes: 480, daySortOrder: 0 }),
        planned({ id: "early", title: "ZZZ Ride", discipline: "BIKE", scheduledTimeMinutes: 360, daySortOrder: 0 }),
      ],
      activities: [],
      linkedActivityIds: new Set(),
      extraSessionIds: new Map(),
    });
    assert.deepEqual(
      sessions.map((s) => s.id),
      ["early", "late"]
    );
    assert.equal(sessions[0]?.href, "/workouts/early?returnTo=%2Fdashboard");
  });

  it("folds a matching extra into the planned session instead of a second card", () => {
    const sessions = buildDayStripSessions({
      dateKey: "2026-08-16",
      todayKey: "2026-08-17",
      planned: [planned({ id: "long-plan", title: "Long Run", estimatedDurationMinutes: 90, plannedMinutes: 90 })],
      activities: [
        activity({ id: "long-file", name: "Morning Run", durationSeconds: 92 * 60 }),
      ],
      linkedActivityIds: new Set(),
      extraSessionIds: new Map(),
    });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, "long-plan");
    assert.equal(sessions[0]?.status, "completed");
    assert.equal(sessions[0]?.href, "/workouts/long-plan?returnTo=%2Fdashboard");
  });

  it("keeps unmatched extras after planned sessions and links them to a known session", () => {
    const sessions = buildDayStripSessions({
      dateKey: "2026-08-16",
      todayKey: "2026-08-17",
      planned: [planned({ id: "bike-plan", title: "Easy Ride", discipline: "BIKE" })],
      activities: [activity({ id: "bonus-run", name: "Shakeout" })],
      linkedActivityIds: new Set(),
      extraSessionIds: new Map([["bonus-run", "flex-session"]]),
    });
    assert.deepEqual(
      sessions.map((s) => s.id),
      ["bike-plan", "bonus-run"]
    );
    assert.equal(sessions[1]?.status, "unplanned");
    assert.equal(sessions[1]?.href, "/workouts/flex-session?returnTo=%2Fdashboard");
  });
});
