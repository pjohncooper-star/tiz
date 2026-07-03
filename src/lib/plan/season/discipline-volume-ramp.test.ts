import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recomputeSeasonWeeks } from "./recompute";
import {
  planUsesDisciplineRamps,
  resolveDisciplineTargets,
} from "./discipline-volume-ramp";
import type { SeasonPhaseInput } from "./types";

function rampPhases(): SeasonPhaseInput[] {
  return [
    {
      name: "Base",
      sortOrder: 0,
      weekCount: 4,
      phaseKind: "BASE",
      focusMode: "PHASE",
      phaseFocus: "AEROBIC_BASE",
      swimSessionsPerWeek: 3,
      bikeSessionsPerWeek: 4,
      runSessionsPerWeek: 3,
      bikeStartHours: 5,
      bikeRampPercent: 10,
      mesocycles: [{ name: "Base I", weekCount: 4 }],
    },
    {
      name: "Taper",
      sortOrder: 1,
      weekCount: 1,
      phaseKind: "TAPER",
      focusMode: "PHASE",
      phaseFocus: "FRESHNESS",
      swimSessionsPerWeek: 2,
      bikeSessionsPerWeek: 2,
      runSessionsPerWeek: 2,
      mesocycles: [{ name: "Taper I", weekCount: 1 }],
    },
  ];
}

describe("discipline-volume-ramp", () => {
  it("detects per-sport hour ramp configuration", () => {
    assert.equal(planUsesDisciplineRamps(rampPhases()), true);
    assert.equal(
      planUsesDisciplineRamps([
        {
          ...rampPhases()[0]!,
          bikeStartHours: null,
          bikeRampPercent: null,
        },
      ]),
      false
    );
  });

  it("sum of disciplines becomes total when hour ramps are set", () => {
    const result = recomputeSeasonWeeks({
      startDate: new Date("2026-01-05"),
      endDate: new Date("2026-02-08"),
      mesocycleLengthWeeks: 4,
      phases: rampPhases(),
      startHours: 10,
      peakHours: 12,
      swimSplitPercent: 20,
      bikeSplitPercent: 50,
      runSplitPercent: 30,
      maxRampPercent: 10,
      deLoadEveryNWeeks: 4,
      deLoadVolumePercent: 60,
      deLoadStrategy: "VOLUME_ONLY",
      reduceCountsOnDeLoad: true,
      longRideStartMin: 60,
      longRidePeakMin: 180,
      longRunStartMin: 30,
      longRunPeakMin: 90,
    });

    for (const week of result.weeks) {
      assert.equal(
        week.totalHours,
        Math.round((week.swimHours + week.bikeHours + week.runHours) * 100) / 100
      );
    }

    assert.ok(result.weeks[1]!.bikeHours > result.weeks[0]!.bikeHours);
  });

  it("resolveDisciplineTargets chains bike hours across phases", () => {
    const phases: SeasonPhaseInput[] = [
      {
        name: "Base",
        sortOrder: 0,
        weekCount: 4,
        phaseKind: "BASE",
        focusMode: "PHASE",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
        bikeStartHours: 4,
        bikeEndHours: 5,
      },
      {
        name: "Build",
        sortOrder: 1,
        weekCount: 4,
        phaseKind: "BUILD",
        focusMode: "PHASE",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
      },
    ];

    const targets = resolveDisciplineTargets(
      phases,
      {
        startHours: 10,
        peakHours: 12,
        longRideStartMin: 60,
        longRidePeakMin: 180,
        longRunStartMin: 30,
        longRunPeakMin: 90,
      },
      "bike",
      {}
    );

    assert.equal(targets[0]?.entry, 4);
    assert.equal(targets[0]?.exit, 5);
    assert.equal(targets[1]?.entry, 5);
  });
});
