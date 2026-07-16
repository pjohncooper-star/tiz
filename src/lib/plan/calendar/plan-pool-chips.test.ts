import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import { computeUnscheduledChips } from "@/lib/plan/calendar/unscheduled-chips";
import { enrichSimpleSeasonWeeks, type SimplePhaseCompute } from "@/lib/plan/season/simple-week-compute";

function basePhase(overrides: Partial<SimplePhaseCompute> = {}): SimplePhaseCompute {
  return {
    id: "phase-1",
    startWeekIndex: 0,
    endWeekIndex: 3,
    planningMode: "SEPARATE_LONGS",
    phaseKind: "BUILD",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
    swimIntenseDaysPerWeek: 1,
    bikeIntenseDaysPerWeek: 2,
    runIntenseDaysPerWeek: 1,
    longRideStartMin: 60,
    longRideEndMin: 120,
    longRunStartMin: 30,
    longRunEndMin: 60,
    longRideOffWeekPolicy: "ENDURANCE_PERCENT",
    longRunOffWeekPolicy: "ENDURANCE_PERCENT",
    longRideOffWeekEndurancePercent: 60,
    longRunOffWeekEndurancePercent: 60,
    rampEnabled: { swim: true, bike: true, run: true },
    ...overrides,
  };
}

function weekTargetFromComputed(
  week: ReturnType<typeof enrichSimpleSeasonWeeks>[number],
  phase: SimplePhaseCompute
): CalendarWeekTarget {
  return {
    weekStart: "2026-07-06",
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    totalHours: week.totalHours,
    phase: { name: "Build", color: "#0ea5e9" },
    strengthSessionsPerWeek: 2,
    planningMode: week.planningMode,
    longRideMinutes: week.longRideMinutes,
    longRunMinutes: week.longRunMinutes,
    longSessionZoneMinutes: week.longSessionZoneMinutes,
    slotBudgets: week.slotBudgets,
    byDiscipline: [
      {
        discipline: "SWIM",
        hours: week.swimHours,
        zoneMinutes: {},
        sessionsPerWeek: phase.swimSessionsPerWeek,
        intenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
      },
      {
        discipline: "BIKE",
        hours: week.bikeHours,
        zoneMinutes: {},
        sessionsPerWeek: phase.bikeSessionsPerWeek,
        intenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
      },
      {
        discipline: "RUN",
        hours: week.runHours,
        zoneMinutes: {},
        sessionsPerWeek: phase.runSessionsPerWeek,
        intenseDaysPerWeek: phase.runIntenseDaysPerWeek,
      },
    ],
    zoneMinutes: week.zoneMinutes,
  };
}

describe("plan → pool skeleton chips", () => {
  it("maps long cadence flags to long and substitute chips via slot budgets", () => {
    const phase = basePhase();
    const weeks = enrichSimpleSeasonWeeks({
      weeks: [
        {
          weekIndex: 0,
          isRestWeek: false,
          swimHours: 2,
          bikeHours: 5,
          runHours: 3,
          totalHours: 10,
          swimDistanceMeters: null,
          runDistanceMeters: null,
        },
        {
          weekIndex: 1,
          isRestWeek: false,
          swimHours: 2,
          bikeHours: 5,
          runHours: 3,
          totalHours: 10,
          swimDistanceMeters: null,
          runDistanceMeters: null,
        },
      ],
      phases: [phase],
      zonePhaseSpans: [],
      phasesWithBlocks: [],
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BUILD", "BUILD"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
      longRideWeekFlags: [true, false],
      longRunWeekFlags: [false, true],
    });

    const week0Target = weekTargetFromComputed(weeks[0]!, phase);
    const week1Target = weekTargetFromComputed(weeks[1]!, phase);

    assert.equal(week0Target.slotBudgets?.BIKE.long, 1);
    assert.equal(week0Target.slotBudgets?.RUN.long, 0);
    assert.ok((week0Target.slotBudgets?.BIKE.substituteEndurance ?? 0) === 0);

    const week0Chips = computeUnscheduledChips("2026-07-06", week0Target, []);
    assert.ok(
      week0Chips.some((c) => c.discipline === "BIKE" && c.slotKind === "LONG"),
      "week 0 should include long bike chip"
    );
    assert.ok(
      !week0Chips.some((c) => c.discipline === "RUN" && c.slotKind === "LONG"),
      "week 0 should not include long run chip"
    );

    const week1Chips = computeUnscheduledChips("2026-07-13", week1Target, []);
    assert.ok(
      week1Chips.some((c) => c.discipline === "RUN" && c.slotKind === "LONG"),
      "week 1 should include long run chip"
    );
    assert.ok(
      !week1Chips.some((c) => c.discipline === "BIKE" && c.slotKind === "LONG"),
      "week 1 should not include long bike chip"
    );
    assert.ok(
      week1Chips.some(
        (c) => c.discipline === "BIKE" && c.slotKind === "SUBSTITUTE_ENDURANCE"
      ),
      "week 1 off-long bike should emit substitute endurance chip"
    );
  });
});
