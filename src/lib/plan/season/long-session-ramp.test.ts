import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLongSessionsForWeek } from "./long-session-ramp";
import type { ComputedMesocycle } from "./types";

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

describe("long-session-ramp", () => {
  it("holds long ride minutes flat within a mesocycle", () => {
    const kinds = Array(8).fill("BASE") as ("BASE" | "BUILD")[];
    const rideAt = (weekIndex: number) =>
      computeLongSessionsForWeek(
        weekIndex,
        kinds,
        twoMesocycles,
        { startMin: 60, peakMin: 120 },
        { startMin: 30, peakMin: 60 }
      ).longRideMinutes;

    assert.equal(rideAt(0), rideAt(1));
    assert.equal(rideAt(2), rideAt(3));
    assert.equal(rideAt(4), rideAt(7));
    assert.ok(rideAt(4) > rideAt(0));
  });

  it("returns the same full plateau on de-load weeks within a mesocycle", () => {
    const kinds = ["BUILD", "BUILD", "BUILD", "BUILD"] as const;
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
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const sibling = computeLongSessionsForWeek(
      1,
      [...kinds],
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(sibling.longRideMinutes, normal.longRideMinutes);
    assert.equal(sibling.longRunMinutes, normal.longRunMinutes);
  });

  it("returns full plateau on taper weeks before tier flags", () => {
    const kinds = ["BUILD", "BUILD", "TAPER", "TAPER"] as const;
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
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const taperWeek = computeLongSessionsForWeek(
      2,
      [...kinds],
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(taperWeek.longRideMinutes, buildWeek.longRideMinutes);
    assert.equal(taperWeek.longRunMinutes, buildWeek.longRunMinutes);
  });

  it("holds race prep at the last ramp plateau", () => {
    const kinds = ["BUILD", "BUILD", "RACE_PREP", "RACE_PREP"] as const;
    const mesocycles: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Build I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 1,
      },
    ];
    const lastBuild = computeLongSessionsForWeek(
      1,
      [...kinds],
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    const racePrep = computeLongSessionsForWeek(
      2,
      [...kinds],
      mesocycles,
      { startMin: 60, peakMin: 120 },
      { startMin: 30, peakMin: 60 }
    );
    assert.equal(racePrep.longRideMinutes, lastBuild.longRideMinutes);
  });
});
