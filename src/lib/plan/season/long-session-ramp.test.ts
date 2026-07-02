import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseKind } from "@prisma/client";
import { computeLongSessionsForWeek } from "./long-session-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

const basePhase: SeasonPhaseInput = {
  name: "Base",
  sortOrder: 0,
  weekCount: 8,
  phaseKind: "BASE",
  focusMode: "PHASE",
  phaseFocus: "AEROBIC_BASE",
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

const twoMesocycles: ComputedMesocycle[] = [
  {
    phaseIndex: 0,
    name: "Base I",
    index: 0,
    startWeekIndex: 0,
    endWeekIndex: 3,
  },
  {
    phaseIndex: 0,
    name: "Base II",
    index: 1,
    startWeekIndex: 4,
    endWeekIndex: 7,
  },
];

function longRideAt(
  weekIndex: number,
  kinds: PhaseKind[],
  mesocycles: ComputedMesocycle[],
  phases: SeasonPhaseInput[]
) {
  return computeLongSessionsForWeek(
    weekIndex,
    kinds,
    phases,
    mesocycles,
    { startHours: 8, peakHours: 12 },
    { startMin: 60, peakMin: 120 },
    { startMin: 30, peakMin: 60 }
  ).longRideMinutes;
}

describe("long-session-ramp", () => {
  it("holds long ride minutes flat within a mesocycle", () => {
    const kinds = Array(8).fill("BASE") as PhaseKind[];
    assert.equal(longRideAt(0, kinds, twoMesocycles, [basePhase]), longRideAt(1, kinds, twoMesocycles, [basePhase]));
    assert.equal(longRideAt(2, kinds, twoMesocycles, [basePhase]), longRideAt(3, kinds, twoMesocycles, [basePhase]));
    assert.equal(longRideAt(4, kinds, twoMesocycles, [basePhase]), longRideAt(7, kinds, twoMesocycles, [basePhase]));
    assert.ok(longRideAt(4, kinds, twoMesocycles, [basePhase]) > longRideAt(0, kinds, twoMesocycles, [basePhase]));
  });

  it("returns the same full plateau on de-load weeks within a mesocycle", () => {
    const kinds = ["BUILD", "BUILD", "BUILD", "BUILD"] as const;
    const buildPhase: SeasonPhaseInput = {
      name: "Build",
      sortOrder: 0,
      weekCount: 4,
      phaseKind: "BUILD",
      focusMode: "PHASE",
      phaseFocus: "THRESHOLD",
      swimSessionsPerWeek: 3,
      bikeSessionsPerWeek: 4,
      runSessionsPerWeek: 3,
      volumeMesocycleMode: "HOLD",
    };
    const mesocycles: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Build I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 3,
      },
    ];
    const normal = computeLongSessionsForWeek(
      0,
      [...kinds],
      [buildPhase],
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const sibling = computeLongSessionsForWeek(
      1,
      [...kinds],
      [buildPhase],
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(sibling.longRideMinutes, normal.longRideMinutes);
    assert.equal(sibling.longRunMinutes, normal.longRunMinutes);
  });

  it("returns full plateau on taper weeks before tier flags", () => {
    const kinds = ["BUILD", "BUILD", "TAPER", "TAPER"] as const;
    const phases: SeasonPhaseInput[] = [
      {
        name: "Build",
        sortOrder: 0,
        weekCount: 2,
        phaseKind: "BUILD",
        focusMode: "PHASE",
        phaseFocus: "THRESHOLD",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
        volumeMesocycleMode: "HOLD",
      },
      {
        name: "Taper",
        sortOrder: 1,
        weekCount: 2,
        phaseKind: "TAPER",
        focusMode: "PHASE",
        phaseFocus: "FRESHNESS",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
      },
    ];
    const mesocycles: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Build I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 1,
      },
    ];
    const buildWeek = computeLongSessionsForWeek(
      0,
      [...kinds],
      phases,
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const taperWeek = computeLongSessionsForWeek(
      2,
      [...kinds],
      phases,
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(taperWeek.longRideMinutes, buildWeek.longRideMinutes);
    assert.equal(taperWeek.longRunMinutes, buildWeek.longRunMinutes);
  });

  it("holds build plateau through race prep when build holds at peak", () => {
    const kinds = ["BUILD", "BUILD", "RACE_PREP", "RACE_PREP"] as const;
    const phases: SeasonPhaseInput[] = [
      {
        name: "Build",
        sortOrder: 0,
        weekCount: 2,
        phaseKind: "BUILD",
        focusMode: "PHASE",
        phaseFocus: "THRESHOLD",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
        volumeMesocycleMode: "HOLD",
      },
      {
        name: "Race prep",
        sortOrder: 1,
        weekCount: 2,
        phaseKind: "RACE_PREP",
        focusMode: "PHASE",
        phaseFocus: "RACE_SPECIFICITY",
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
        volumeMesocycleMode: "HOLD",
      },
    ];
    const mesocycles: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Build I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 1,
      },
      {
        phaseIndex: 1,
        name: "Race prep I",
        index: 0,
        startWeekIndex: 2,
        endWeekIndex: 3,
      },
    ];
    const lastBuild = computeLongSessionsForWeek(
      1,
      [...kinds],
      phases,
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const racePrep = computeLongSessionsForWeek(
      2,
      [...kinds],
      phases,
      mesocycles,
      { startHours: 10, peakHours: 10 },
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(racePrep.longRideMinutes, 108);
    assert.equal(lastBuild.longRideMinutes, 120);
    assert.ok(racePrep.longRideMinutes < lastBuild.longRideMinutes);
  });
});
