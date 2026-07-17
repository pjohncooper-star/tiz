import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import {
  computeWeekSlotBudgets,
  enrichSimpleSeasonWeeks,
  type SimplePhaseCompute,
  type WeekSlotBudgets,
} from "./simple-week-compute";
import { buildPhaseBlocks } from "./phase-blocks";
import type { ZonePhaseSpan } from "./zone-split";

function disciplineTotal(row: WeekSlotBudgets["BIKE"]): number {
  return row.endurance + row.intensity + row.long + row.substituteEndurance;
}

function basePhase(overrides: Partial<SimplePhaseCompute> = {}): SimplePhaseCompute {
  return {
    id: "phase-1",
    startWeekIndex: 0,
    endWeekIndex: 3,
    planningMode: "SEPARATE_LONGS",
    phaseKind: "BASE",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
    swimIntenseDaysPerWeek: 1,
    bikeIntenseDaysPerWeek: 1,
    runIntenseDaysPerWeek: 1,
    longRideStartMin: 60,
    longRideEndMin: 120,
    longRunStartMin: 30,
    longRunEndMin: 60,
    longRideOffWeekPolicy: "ENDURANCE_PERCENT",
    longRunOffWeekPolicy: "NONE",
    longRideOffWeekEndurancePercent: 60,
    longRunOffWeekEndurancePercent: 60,
    rampEnabled: { swim: true, bike: true, run: true },
    ...overrides,
  };
}

describe("simple-week-compute", () => {
  it("carves long minutes from bike/run hours in separate-longs mode", () => {
    const phases = [basePhase()];
    const phasesWithBlocks = buildPhaseBlocks({
      mesocycleLengthWeeks: 4,
      phases: [
        {
          id: "phase-1",
          name: "Base",
          startWeekIndex: 0,
          endWeekIndex: 3,
        },
      ],
    });
    const zonePhaseSpans: ZonePhaseSpan[] = [];

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
      ],
      phases,
      zonePhaseSpans,
      phasesWithBlocks,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
    });

    const week = weeks[0]!;
    assert.equal(week.planningMode, "SEPARATE_LONGS");
    assert.ok(week.slotBudgets.BIKE.endurance >= 0);
    assert.ok(week.mesocycleId != null);
  });

  it("allocates endurance and intensity slots from session counts", () => {
    const phases = [
      basePhase({
        planningMode: "BY_DISCIPLINE",
        bikeSessionsPerWeek: 4,
        bikeIntenseDaysPerWeek: 2,
      }),
    ];

    const weeks = enrichSimpleSeasonWeeks({
      weeks: [
        {
          weekIndex: 0,
          isRestWeek: false,
          swimHours: 2,
          bikeHours: 4,
          runHours: 3,
          totalHours: 9,
          swimDistanceMeters: null,
          runDistanceMeters: null,
        },
      ],
      phases,
      zonePhaseSpans: [],
      phasesWithBlocks: [],
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
    });

    assert.equal(weeks[0]!.slotBudgets.BIKE.endurance, 2);
    assert.equal(weeks[0]!.slotBudgets.BIKE.intensity, 2);
    assert.equal(weeks[0]!.slotBudgets.BIKE.long, 0);
  });

  it("stores long-session zone minutes in separate-long-tiz mode", () => {
    const phases = [
      basePhase({
        planningMode: "SEPARATE_LONG_TIZ",
        zoneSplits: {
          SWIM: { mode: "custom", percents: { z1: 100, z2: 0, z3: 0, z4: 0, z5: 0 } },
          BIKE: { mode: "custom", percents: { z1: 10, z2: 80, z3: 10, z4: 0, z5: 0 } },
          RUN: { mode: "custom", percents: { z1: 10, z2: 80, z3: 10, z4: 0, z5: 0 } },
        },
      }),
    ];

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
      ],
      phases,
      zonePhaseSpans: [
        {
          startWeekIndex: 0,
          endWeekIndex: 3,
          rampEnabled: { swim: false, bike: false, run: false },
          zoneSplits: phases[0]!.zoneSplits!,
        },
      ],
      phasesWithBlocks: [],
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
    });

    const week = weeks[0]!;
    if (week.longRideMinutes > 0) {
      assert.ok((week.longSessionZoneMinutes[zoneKey("BIKE", 2)] ?? 0) > 0);
    }
  });

  it("keeps main bag bike hours when long ride is scheduled", () => {
    const phases = [basePhase()];
    const phasesWithBlocks = buildPhaseBlocks({
      mesocycleLengthWeeks: 4,
      phases: [
        {
          id: "phase-1",
          name: "Base",
          startWeekIndex: 0,
          endWeekIndex: 3,
        },
      ],
    });

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
      ],
      phases,
      zonePhaseSpans: [],
      phasesWithBlocks,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
    });

    const week = weeks[0]!;
    assert.equal(week.planningMode, "SEPARATE_LONGS");
    assert.equal(week.bikeHours, 5);
    assert.ok(week.longRideMinutes > 0);
  });

  it("uses stored long week flags with all-on default", () => {
    const phases = [basePhase()];
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
      phases,
      zonePhaseSpans: [],
      phasesWithBlocks: [],
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE", "BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
      longRideWeekFlags: [true, false],
      longRunWeekFlags: [false, true],
    });

    assert.ok(weeks[0]!.longRideMinutes > 0);
    assert.equal(weeks[0]!.longRunMinutes, 0);
    assert.equal(weeks[0]!.slotBudgets.BIKE.long, 1);
    assert.equal(weeks[0]!.slotBudgets.RUN.long, 0);

    assert.equal(weeks[1]!.longRideMinutes, 0);
    assert.ok(weeks[1]!.longRunMinutes > 0);
    assert.equal(weeks[1]!.slotBudgets.BIKE.long, 0);
    assert.equal(weeks[1]!.slotBudgets.RUN.long, 1);
  });

  it("forces long sessions off on rest weeks even when stored true", () => {
    const phases = [basePhase()];
    const weeks = enrichSimpleSeasonWeeks({
      weeks: [
        {
          weekIndex: 0,
          isRestWeek: true,
          swimHours: 2,
          bikeHours: 5,
          runHours: 3,
          totalHours: 10,
          swimDistanceMeters: null,
          runDistanceMeters: null,
        },
      ],
      phases,
      zonePhaseSpans: [],
      phasesWithBlocks: [],
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      deLoadStrategy: "VOLUME_ONLY",
      seasonSplit: { swim: 33.33, bike: 33.34, run: 33.33 },
      longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      phaseKindsByWeek: ["BASE"],
      taperWeekIndices: [],
      deLoadEveryNWeeks: 4,
      longRideWeekFlags: [true],
      longRunWeekFlags: [true],
    });

    const week = weeks[0]!;
    assert.equal(week.longRideMinutes, 0);
    assert.equal(week.longRunMinutes, 0);
    assert.equal(week.slotBudgets.BIKE.long, 0);
    assert.equal(week.slotBudgets.RUN.long, 0);
  });

  describe("modes 3–4 sessions include long seat", () => {
    const phase = basePhase({
      bikeSessionsPerWeek: 4,
      bikeIntenseDaysPerWeek: 1,
      runSessionsPerWeek: 4,
      runIntenseDaysPerWeek: 1,
      swimSessionsPerWeek: 3,
      swimIntenseDaysPerWeek: 1,
    });

    it("full long week: endurance + intensity + long === sessions", () => {
      for (const mode of ["SEPARATE_LONGS", "SEPARATE_LONG_TIZ"] as const) {
        const budgets = computeWeekSlotBudgets({
          phase,
          mode,
          longRideFull: true,
          longRunFull: true,
          longRideResult: { kind: "none" },
          longRunResult: { kind: "none" },
        });
        assert.equal(budgets.BIKE.long, 1);
        assert.equal(budgets.BIKE.intensity, 1);
        assert.equal(budgets.BIKE.endurance, 2);
        assert.equal(disciplineTotal(budgets.BIKE), phase.bikeSessionsPerWeek);
        assert.equal(disciplineTotal(budgets.RUN), phase.runSessionsPerWeek);
        // Swim has no long seat — still sessions = endurance + intensity
        assert.equal(budgets.SWIM.long, 0);
        assert.equal(disciplineTotal(budgets.SWIM), phase.swimSessionsPerWeek);
      }
    });

    it("off-week NONE: total cards === sessions - 1", () => {
      const budgets = computeWeekSlotBudgets({
        phase,
        mode: "SEPARATE_LONGS",
        longRideFull: false,
        longRunFull: false,
        longRideResult: { kind: "none" },
        longRunResult: { kind: "none" },
      });
      assert.equal(budgets.BIKE.long, 0);
      assert.equal(budgets.BIKE.intensity, 1);
      assert.equal(budgets.BIKE.endurance, 2);
      assert.equal(disciplineTotal(budgets.BIKE), phase.bikeSessionsPerWeek - 1);
      assert.equal(disciplineTotal(budgets.RUN), phase.runSessionsPerWeek - 1);
    });

    it("off-week extra intensity: total === sessions", () => {
      const budgets = computeWeekSlotBudgets({
        phase,
        mode: "SEPARATE_LONGS",
        longRideFull: false,
        longRunFull: false,
        longRideResult: { kind: "extra_intensity" },
        longRunResult: { kind: "extra_intensity" },
      });
      assert.equal(budgets.BIKE.long, 0);
      assert.equal(budgets.BIKE.intensity, 2);
      assert.equal(budgets.BIKE.endurance, 2);
      assert.equal(disciplineTotal(budgets.BIKE), phase.bikeSessionsPerWeek);
    });

    it("off-week substitute: total === sessions", () => {
      const budgets = computeWeekSlotBudgets({
        phase,
        mode: "SEPARATE_LONGS",
        longRideFull: false,
        longRunFull: false,
        longRideResult: { kind: "substitute_endurance", durationMinutes: 72 },
        longRunResult: { kind: "substitute_endurance", durationMinutes: 36 },
      });
      assert.equal(budgets.BIKE.long, 0);
      assert.equal(budgets.BIKE.substituteEndurance, 1);
      assert.equal(budgets.BIKE.substituteDurationMinutes, 72);
      assert.equal(budgets.BIKE.intensity, 1);
      assert.equal(budgets.BIKE.endurance, 2);
      assert.equal(disciplineTotal(budgets.BIKE), phase.bikeSessionsPerWeek);
    });

    it("sessions = 1 on a long week yields only the long", () => {
      const budgets = computeWeekSlotBudgets({
        phase: basePhase({
          bikeSessionsPerWeek: 1,
          bikeIntenseDaysPerWeek: 1,
        }),
        mode: "SEPARATE_LONGS",
        longRideFull: true,
        longRunFull: false,
        longRideResult: { kind: "none" },
        longRunResult: { kind: "none" },
      });
      assert.equal(budgets.BIKE.long, 1);
      assert.equal(budgets.BIKE.intensity, 0);
      assert.equal(budgets.BIKE.endurance, 0);
      assert.equal(disciplineTotal(budgets.BIKE), 1);
    });

    it("modes 1–2 still treat sessions as intense + endurance only", () => {
      const budgets = computeWeekSlotBudgets({
        phase,
        mode: "BY_DISCIPLINE",
        longRideFull: true,
        longRunFull: true,
        longRideResult: { kind: "none" },
        longRunResult: { kind: "none" },
      });
      assert.equal(budgets.BIKE.long, 0);
      assert.equal(budgets.BIKE.intensity, 1);
      assert.equal(budgets.BIKE.endurance, 3);
      assert.equal(disciplineTotal(budgets.BIKE), phase.bikeSessionsPerWeek);
    });
  });
});
