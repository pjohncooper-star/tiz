import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  computeUnscheduledChips,
  countScheduledSessionsByDiscipline,
  countScheduledSlotsByDiscipline,
  hasUsableTypedSlotBudgets,
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
    poolSlotKind: null,
  };
}

function sessionWithSlot(
  discipline: CalendarPlannedSession["discipline"],
  sessionRole: CalendarPlannedSession["sessionRole"],
  poolSlotKind: CalendarPlannedSession["poolSlotKind"]
): CalendarPlannedSession {
  return { ...session(discipline), sessionRole, displaySessionRole: sessionRole, poolSlotKind };
}

const EMPTY_SLOT_BUDGETS = {
  SWIM: {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  },
  BIKE: {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  },
  RUN: {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  },
};

describe("unscheduled-chips", () => {
  it("falls back to phase session counts when slot budgets are all-zero", () => {
    const weekTarget = baseWeekTarget({ slotBudgets: EMPTY_SLOT_BUDGETS });
    const chips = computeUnscheduledChips("2026-08-10", weekTarget, []);

    assert.equal(hasUsableTypedSlotBudgets(weekTarget), false);
    assert.equal(chips.filter((c) => c.discipline === "SWIM").length, 3);
    assert.equal(chips.filter((c) => c.discipline === "BIKE").length, 3);
    assert.equal(chips.filter((c) => c.discipline === "RUN").length, 2);
    assert.equal(chips.filter((c) => c.discipline === "STRENGTH").length, 2);
  });

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
    assert.equal(chips[0]?.label, "Swim · Endurance");
    assert.equal(chips[0]?.slotKind, "ENDURANCE");
  });

  it("emits typed long and intense slots from slot budgets", () => {
    const chips = computeUnscheduledChips(
      "2026-07-06",
      baseWeekTarget({
        slotBudgets: {
          SWIM: {
            endurance: 2,
            intensity: 1,
            long: 0,
            substituteEndurance: 0,
            substituteDurationMinutes: 0,
          },
          BIKE: {
            endurance: 2,
            intensity: 1,
            long: 1,
            substituteEndurance: 0,
            substituteDurationMinutes: 0,
          },
          RUN: {
            endurance: 1,
            intensity: 1,
            long: 0,
            substituteEndurance: 1,
            substituteDurationMinutes: 45,
          },
        },
        longRideMinutes: 120,
      }),
      [session("BIKE", "FLEXIBLE")]
    );

    const bikeLong = chips.filter((c) => c.discipline === "BIKE" && c.slotKind === "LONG");
    assert.equal(bikeLong.length, 1);
    assert.equal(bikeLong[0]?.targetDurationMinutes, 120);
    assert.equal(bikeLong[0]?.label, "Bike · Long · 2h");
    const runSub = chips.filter(
      (c) => c.discipline === "RUN" && c.slotKind === "SUBSTITUTE_ENDURANCE"
    );
    assert.equal(runSub.length, 1);
    assert.equal(runSub[0]?.targetDurationMinutes, 45);
    assert.equal(runSub[0]?.label, "Run · Endurance (sub) · 45m");
  });

  it("decrements substitute chips when session has poolSlotKind SUBSTITUTE_ENDURANCE", () => {
    const weekTarget = baseWeekTarget({
      slotBudgets: {
        SWIM: {
          endurance: 0,
          intensity: 0,
          long: 0,
          substituteEndurance: 0,
          substituteDurationMinutes: 0,
        },
        BIKE: {
          endurance: 0,
          intensity: 0,
          long: 0,
          substituteEndurance: 0,
          substituteDurationMinutes: 0,
        },
        RUN: {
          endurance: 1,
          intensity: 0,
          long: 0,
          substituteEndurance: 1,
          substituteDurationMinutes: 45,
        },
      },
    });
    const chips = computeUnscheduledChips("2026-07-06", weekTarget, [
      sessionWithSlot("RUN", "MODERATE", "SUBSTITUTE_ENDURANCE"),
    ]);
    const runEndurance = chips.filter(
      (c) => c.discipline === "RUN" && c.slotKind === "ENDURANCE"
    );
    const runSub = chips.filter(
      (c) => c.discipline === "RUN" && c.slotKind === "SUBSTITUTE_ENDURANCE"
    );
    assert.equal(runEndurance.length, 1);
    assert.equal(runSub.length, 0);
  });

  it("counts poolSlotKind before sessionRole fallback", () => {
    const counts = countScheduledSlotsByDiscipline([
      sessionWithSlot("RUN", "MODERATE", "SUBSTITUTE_ENDURANCE"),
      sessionWithSlot("RUN", "MODERATE", "ENDURANCE"),
    ]);
    assert.equal(counts.get("RUN")?.get("SUBSTITUTE_ENDURANCE"), 1);
    assert.equal(counts.get("RUN")?.get("ENDURANCE"), 1);
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
