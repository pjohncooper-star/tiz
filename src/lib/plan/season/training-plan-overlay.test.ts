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
    assert.equal(next.slotBudgets?.RUN.endurance, 1);
    assert.equal(next.slotBudgets?.RUN.intensity, 1);
    assert.equal(next.slotBudgets?.RUN.long, 1);
  });

  it("replaces season hours with the program even when the program is lighter", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 5, totalHours: 14 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 40,
          attachmentId: "att-1",
          dayOffset: 0,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.runHours, 0.67);
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

  it("does not rewrite fully past weeks when todayKey is set", () => {
    const past = week({
      weekStartDate: "2026-07-27",
      runHours: 9,
      totalHours: 18,
    });
    const current = week({
      weekIndex: 1,
      weekStartDate: "2026-08-03",
      runHours: 2,
      totalHours: 11,
    });
    const overlaid = overlayPlanLoadOnWeeks(
      [past, current],
      [
        {
          scheduledDateKey: "2026-07-28",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 30,
        },
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 120,
        },
      ],
      { todayKey: "2026-08-03" }
    );
    assert.equal(overlaid[0]!.runHours, 9);
    assert.equal(overlaid[1]!.runHours, 2);
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

  it("drives each sport from its own program and leaves others on the ramp", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week()],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "SWIM",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
          attachmentId: "swim-att",
          dayOffset: 0,
          sortOrder: 0,
        },
        {
          scheduledDateKey: "2026-08-05",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 50,
          attachmentId: "run-att",
          dayOffset: 1,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.swimHours, 1);
    assert.equal(overlaid[0]!.runHours, 0.83);
    assert.equal(overlaid[0]!.bikeHours, 6);
  });

  it("sums two programs on different days of the same sport", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 8 })],
      [
        {
          scheduledDateKey: "2026-08-03",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
        {
          scheduledDateKey: "2026-08-06",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 45,
          attachmentId: "b",
          dayOffset: 3,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.runHours, 1.75);
    assert.equal(overlaid[0]!.programSessionCounts?.RUN, 2);
  });

  it("omits a dropped clash session from hours and slots", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 1 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "INTENSITY",
          estimatedDurationMinutes: 50,
          attachmentId: "b",
          dayOffset: 0,
          sortOrder: 0,
        },
      ],
      {
        conflicts: [
          {
            losingAttachmentId: "b",
            dayOffset: 0,
            sortOrder: 0,
            resolution: "drop",
          },
        ],
      }
    );
    assert.equal(overlaid[0]!.runHours, 1);
    assert.equal(overlaid[0]!.slotBudgets?.RUN.intensity, 0);
    assert.equal(overlaid[0]!.programSessionCounts?.RUN, 1);
  });

  it("keeps both clash sessions when resolution is keep", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 1 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "INTENSITY",
          estimatedDurationMinutes: 50,
          attachmentId: "b",
          dayOffset: 0,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.runHours, 1.83);
    assert.equal(overlaid[0]!.programSessionCounts?.RUN, 2);
  });

  it("does not pad extra chips unless leftover-TiZ is on", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week()],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 40,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
      ]
    );
    const runSlots = overlaid[0]!.slotBudgets!.RUN;
    assert.equal(runSlots.endurance + runSlots.intensity + runSlots.long, 1);
  });

  it("adds leftover extra chips when leftover-TiZ is on and ramp hours remain", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week({ runHours: 3 })],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 40,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
      ],
      {
        ownership: [
          {
            attachmentId: "a",
            owns: ["RUN"],
            fillLeftoverTiz: { RUN: true },
          },
        ],
      }
    );
    assert.equal(overlaid[0]!.runHours, 3);
    const runSlots = overlaid[0]!.slotBudgets!.RUN;
    assert.ok(runSlots.endurance + runSlots.intensity + runSlots.long > 1);
  });

  it("leaves a paused program's week on the season ramp while the other still applies", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [
        week({ weekStartDate: "2026-08-03" }),
        week({ weekIndex: 1, weekStartDate: "2026-08-10", runHours: 4, totalHours: 13 }),
      ],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 60,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
        {
          scheduledDateKey: "2026-08-11",
          discipline: "SWIM",
          sessionRole: "EASY",
          estimatedDurationMinutes: 45,
          attachmentId: "b",
          dayOffset: 0,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.runHours, 1);
    assert.equal(overlaid[1]!.swimHours, 0.75);
    assert.equal(overlaid[1]!.runHours, 4);
  });

  it("includes strength hours in the week total", () => {
    const overlaid = overlayPlanLoadOnWeeks(
      [week()],
      [
        {
          scheduledDateKey: "2026-08-04",
          discipline: "STRENGTH",
          sessionRole: "MODERATE",
          estimatedDurationMinutes: 45,
          attachmentId: "a",
          dayOffset: 0,
          sortOrder: 0,
        },
      ]
    );
    assert.equal(overlaid[0]!.strengthHours, 0.75);
    assert.equal(overlaid[0]!.strengthSessions, 1);
    assert.equal(overlaid[0]!.totalHours, 11.75);
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
