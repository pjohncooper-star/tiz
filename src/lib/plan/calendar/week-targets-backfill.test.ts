import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCalendarWeekPoolFields,
  needsSlotBudgetBackfill,
  type SimplePhaseCompute,
  type WeekSlotBudgets,
} from "@/lib/plan/season/simple-week-compute";

function emptyBudgets(): WeekSlotBudgets {
  return {
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
}

function basePhase(): SimplePhaseCompute {
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
  };
}

describe("calendar week slot budget backfill", () => {
  it("needs backfill when stored budgets are null or all-zero", () => {
    const phase = basePhase();
    assert.equal(needsSlotBudgetBackfill(null, phase), true);
    assert.equal(needsSlotBudgetBackfill(emptyBudgets(), phase), true);
    assert.equal(
      needsSlotBudgetBackfill(
        {
          ...emptyBudgets(),
          BIKE: {
            endurance: 2,
            intensity: 2,
            long: 0,
            substituteEndurance: 0,
            substituteDurationMinutes: 0,
          },
        },
        phase
      ),
      false
    );
  });

  it("computes typed slot budgets from phase session counts without DB recalculate", () => {
    const phase = basePhase();
    const fields = computeCalendarWeekPoolFields({
      weekIndex: 0,
      isRestWeek: false,
      phase,
      planningMode: "SEPARATE_LONGS",
      context: {
        longRideWeekFlags: [true, false],
        longRunWeekFlags: [false, true],
        longAnchors: { rideStart: 60, ridePeak: 180, runStart: 30, runPeak: 90 },
      },
    });

    // sessions=4 includes the long seat → mainSessions=3 → intensity 2 + endurance 1 + long 1
    assert.equal(fields.slotBudgets.BIKE.endurance, 1);
    assert.equal(fields.slotBudgets.BIKE.intensity, 2);
    assert.equal(fields.slotBudgets.BIKE.long, 1);
    assert.equal(fields.slotBudgets.RUN.long, 0);
    assert.ok(fields.longRideMinutes > 0);
    assert.equal(fields.longRunMinutes, 0);
  });
});
