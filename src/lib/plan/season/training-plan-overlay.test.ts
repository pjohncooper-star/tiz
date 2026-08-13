import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeUnscheduledChips } from "@/lib/plan/calendar/unscheduled-chips";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  overlayPlanLoadOnWeeks,
  targetZonesForPlanSession,
  type OverlayWeekTarget,
} from "./training-plan-overlay";
import { zoneKey } from "@/lib/workout/steps";
import { WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";

function emptySlots() {
  return {
    SWIM: {
      endurance: 3,
      intensity: 1,
      long: 0,
      substituteEndurance: 0,
      substituteDurationMinutes: 0,
    },
    BIKE: {
      endurance: 3,
      intensity: 1,
      long: 1,
      substituteEndurance: 0,
      substituteDurationMinutes: 0,
    },
    RUN: {
      endurance: 2,
      intensity: 1,
      long: 0,
      substituteEndurance: 0,
      substituteDurationMinutes: 0,
    },
  };
}

function week(overrides: Partial<OverlayWeekTarget> = {}): OverlayWeekTarget {
  return {
    weekIndex: 0,
    weekStartDate: "2026-08-03",
    swimHours: 3,
    bikeHours: 6,
    runHours: 2,
    totalHours: 11,
    zoneMinutes: {
      [zoneKey("RUN", 2)]: 120,
    },
    slotBudgets: emptySlots(),
    ...overrides,
  };
}

describe("targetZonesForPlanSession", () => {
  it("rolls up workout tree zones", () => {
    const zones = targetZonesForPlanSession({
      scheduledDateKey: "2026-08-04",
      discipline: "RUN",
      sessionRole: "INTENSITY",
      estimatedDurationMinutes: 45,
      steps: {
        version: WORKOUT_TREE_VERSION,
        nodes: [
          {
            kind: "step",
            intensity: "interval",
            duration: { type: "time", value: 1800 },
            target: { signal: "pace", mode: "zone", zone: 4 },
          },
        ],
      },
    });
    assert.equal(zones?.["4"], 30);
  });

  it("returns null for skeleton sessions", () => {
    assert.equal(
      targetZonesForPlanSession({
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        sessionRole: "EASY",
        estimatedDurationMinutes: 45,
        steps: null,
      }),
      null
    );
  });
});

describe("overlayPlanLoadOnWeeks", () => {
  it("raises run hours and slots to cover the attached plan", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week()],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
        },
        {
          scheduledDateKey: "2026-08-05",
          discipline: "RUN",
          sessionRole: "INTENSITY",
          estimatedDurationMinutes: 50,
        },
        {
          scheduledDateKey: "2026-08-06",
          discipline: "RUN",
          sessionRole: "LONG",
          estimatedDurationMinutes: 90,
        },
      ]
    );
    const next = overlaid[0]!;
    assert.equal(next.runHours, 3.33);
    assert.equal(next.swimHours, 3);
    assert.equal(next.slotBudgets?.RUN.endurance, 2);
    assert.equal(next.slotBudgets?.RUN.intensity, 1);
    assert.equal(next.slotBudgets?.RUN.long, 1);
  });

  it("does not lower season hours when the plan is lighter", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 5, totalHours: 14 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 40,
        },
      ]
    );
    assert.equal(overlaid[0]!.runHours, 5);
  });

  it("leaves paused weeks unchanged when no plan sessions land there", () => {
    const paused = week({
      weekIndex: 1,
      weekStartDate: "2026-08-10",
      runHours: 4,
      totalHours: 13,
    });
    const overlaid = overlayPlanLoadOnWeeks(
      [week(), paused],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 200,
        },
      ]
    );
    assert.ok((overlaid[0]!.runHours ?? 0) > 2);
    assert.equal(overlaid[1]!.runHours, 4);
  });

  it("replaces run TiZ when plan hours exceed the season ramp", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 1, totalHours: 10 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "INTENSITY",
          estimatedDurationMinutes: 90,
          steps: {
            version: WORKOUT_TREE_VERSION,
            nodes: [
              {
                kind: "step",
                intensity: "interval",
                duration: { type: "time", value: 5400 },
                target: { signal: "pace", mode: "zone", zone: 4 },
              },
            ],
          },
        },
      ]
    );
    assert.equal(overlaid[0]!.zoneMinutes[zoneKey("RUN", 4)], 90);
    assert.equal(overlaid[0]!.zoneMinutes[zoneKey("RUN", 2)] ?? 0, 0);
  });

  it("allocates skeleton duration with phase zone splits", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 0.5, totalHours: 9.5, zoneMinutes: {} })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
        },
      ],
      {
        zonePercentsForWeek: () => ({
          z1: 20,
          z2: 80,
          z3: 0,
          z4: 0,
          z5: 0,
        }),
      }
    );
    assert.equal(overlaid[0]!.zoneMinutes[zoneKey("RUN", 1)], 12);
    assert.equal(overlaid[0]!.zoneMinutes[zoneKey("RUN", 2)], 48);
  });
});

describe("unscheduled leftover after plan overlay", () => {
  it("leaves no run chips when the plan fills the run slot budget", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week()],
      [
        {
          scheduledDateKey: "2026-08-03",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 45,
        },
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 45,
        },
        {
          scheduledDateKey: "2026-08-05",
          discipline: "RUN",
          sessionRole: "INTENSITY",
          estimatedDurationMinutes: 50,
        },
      ]
    );
    const weekTarget: CalendarWeekTarget = {
      weekStart: "2026-08-03",
      weekIndex: 0,
      isRestWeek: false,
      totalHours: overlaid[0]!.totalHours,
      phase: { name: "Build", color: "#0ea5e9" },
      strengthSessionsPerWeek: 0,
      zoneMinutes: {},
      byDiscipline: [
        { discipline: "SWIM", hours: 3, zoneMinutes: {}, sessionsPerWeek: 4, intenseDaysPerWeek: 1 },
        { discipline: "BIKE", hours: 6, zoneMinutes: {}, sessionsPerWeek: 5, intenseDaysPerWeek: 1 },
        { discipline: "RUN", hours: overlaid[0]!.runHours, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
      ],
      slotBudgets: overlaid[0]!.slotBudgets,
    };
    const sessions = [
      calendarSession("RUN", "EASY"),
      calendarSession("RUN", "EASY"),
      calendarSession("RUN", "INTENSITY"),
    ];
    const chips = computeUnscheduledChips("2026-08-03", weekTarget, sessions);
    assert.equal(
      chips.filter((chip) => chip.discipline === "RUN").length,
      0
    );
    assert.ok(chips.some((chip) => chip.discipline === "SWIM"));
  });
});

function calendarSession(
  discipline: CalendarPlannedSession["discipline"],
  sessionRole: CalendarPlannedSession["sessionRole"]
): CalendarPlannedSession {
  return {
    id: `${discipline}-${sessionRole}-${Math.random()}`,
    scheduledDate: "2026-08-04",
    scheduledTimeMinutes: null,
    daySortOrder: 0,
    discipline,
    title: "Plan run",
    totalMinutes: 45,
    plannedMinutes: 45,
    distanceMeters: null,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: true,
    source: "PLAN",
    poolSize: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: 45,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole,
    displaySessionRole: sessionRole,
    tizSignalOverride: null,
    poolSlotKind: null,
  };
}
