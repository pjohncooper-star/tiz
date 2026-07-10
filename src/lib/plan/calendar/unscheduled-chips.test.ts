import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  computeUnscheduledChips,
  countScheduledSessionsByDiscipline,
} from "./unscheduled-chips";

function baseWeekTarget(overrides: Partial<CalendarWeekTarget> = {}): CalendarWeekTarget {
  return {
    weekStart: "2026-07-06",
    weekIndex: 0,
    isRestWeek: false,
    totalHours: 8,
    phase: { name: "Build", color: "#0ea5e9" },
    strengthSessionsPerWeek: 2,
    zoneMinutes: {},
    byDiscipline: [
      { discipline: "SWIM", hours: 2, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
      { discipline: "BIKE", hours: 3, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 2 },
      { discipline: "RUN", hours: 2, zoneMinutes: {}, sessionsPerWeek: 2, intenseDaysPerWeek: 1 },
    ],
    ...overrides,
  };
}

function session(
  discipline: CalendarPlannedSession["discipline"],
  source: CalendarPlannedSession["source"] = "FLEXIBLE"
): CalendarPlannedSession {
  return {
    id: `${discipline}-${source}-${Math.random()}`,
    scheduledDate: "2026-07-07",
    discipline,
    title: "Session",
    totalMinutes: 45,
    plannedMinutes: 45,
    distanceMeters: null,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: true,
    source,
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
  };
}

describe("unscheduled-chips", () => {
  it("returns chips for session budget minus scheduled count", () => {
    const chips = computeUnscheduledChips("2026-07-06", baseWeekTarget(), [
      session("SWIM"),
      session("SWIM"),
      session("BIKE"),
      session("BIKE"),
      session("BIKE"),
      session("RUN"),
      session("STRENGTH"),
    ]);

    assert.deepEqual(
      chips.map((chip) => chip.discipline),
      ["SWIM", "RUN", "STRENGTH"]
    );
    assert.equal(chips[0]?.label, "Swim");
  });

  it("does not count race sessions toward the scheduled total", () => {
    const chips = computeUnscheduledChips(
      "2026-07-06",
      baseWeekTarget({
        strengthSessionsPerWeek: 0,
        byDiscipline: [
          { discipline: "SWIM", hours: 2, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 0 },
          { discipline: "BIKE", hours: 0, zoneMinutes: {}, sessionsPerWeek: 0, intenseDaysPerWeek: 0 },
          { discipline: "RUN", hours: 0, zoneMinutes: {}, sessionsPerWeek: 0, intenseDaysPerWeek: 0 },
        ],
      }),
      [
        session("SWIM"),
        session("SWIM"),
        session("SWIM"),
        session("SWIM", "RACE"),
      ]
    );
    assert.equal(chips.length, 0);
  });

  it("returns no chips when over-scheduled", () => {
    const chips = computeUnscheduledChips(
      "2026-07-06",
      baseWeekTarget({
        strengthSessionsPerWeek: 0,
        byDiscipline: [
          { discipline: "SWIM", hours: 1, zoneMinutes: {}, sessionsPerWeek: 1, intenseDaysPerWeek: 0 },
          { discipline: "BIKE", hours: 1, zoneMinutes: {}, sessionsPerWeek: 0, intenseDaysPerWeek: 0 },
          { discipline: "RUN", hours: 1, zoneMinutes: {}, sessionsPerWeek: 0, intenseDaysPerWeek: 0 },
        ],
      }),
      [session("SWIM"), session("SWIM")]
    );
    assert.equal(chips.length, 0);
  });

  it("counts disciplines via countScheduledSessionsByDiscipline", () => {
    const counts = countScheduledSessionsByDiscipline([
      session("BIKE"),
      session("RUN"),
      session("RUN", "RACE"),
    ]);
    assert.equal(counts.get("BIKE"), 1);
    assert.equal(counts.get("RUN"), 1);
    assert.equal(counts.get("SWIM"), 0);
  });
});
