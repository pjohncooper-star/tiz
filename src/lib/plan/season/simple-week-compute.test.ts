import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import { enrichSimpleSeasonWeeks, type SimplePhaseCompute } from "./simple-week-compute";
import { buildPhaseBlocks } from "./phase-blocks";
import type { ZonePhaseSpan } from "./zone-split";

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
});
