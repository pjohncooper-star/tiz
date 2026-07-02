import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMesocyclesFromExplicitDefinitions,
  resolveMesocycles,
  splitAllPhasesIntoMesocycles,
} from "./phase-split";
import { recomputeSeasonWeeks } from "./recompute";
import type { SeasonPhaseInput } from "./types";

const basePhase = {
  name: "Base",
  sortOrder: 0,
  weekCount: 8,
  phaseKind: "BASE" as const,
  focusMode: "PHASE" as const,
  phaseFocus: "AEROBIC_BASE" as const,
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

describe("mesocycle resolution", () => {
  it("uses explicit mesocycle definitions when valid", () => {
    const phases = [
      {
        ...basePhase,
        mesocycles: [
          { name: "Base I", weekCount: 3 },
          { name: "Base II", weekCount: 5 },
        ],
      },
    ];
    const mesocycles = buildMesocyclesFromExplicitDefinitions(phases);
    assert.equal(mesocycles?.length, 2);
    assert.equal(mesocycles?.[0]?.name, "Base I");
    assert.equal(mesocycles?.[0]?.endWeekIndex, 2);
    assert.equal(mesocycles?.[1]?.startWeekIndex, 3);
    assert.equal(mesocycles?.[1]?.endWeekIndex, 7);
  });

  it("falls back to auto split when mesocycle weeks do not match phase", () => {
    const phases = [
      {
        ...basePhase,
        mesocycles: [{ name: "Base I", weekCount: 3 }],
      },
    ];
    assert.equal(buildMesocyclesFromExplicitDefinitions(phases), null);
    const auto = resolveMesocycles(phases, 4);
    assert.equal(auto.length, splitAllPhasesIntoMesocycles(phases, 4).length);
  });

  it("recompute uses persisted de-load week flags when length matches", () => {
    const phases: SeasonPhaseInput[] = [
      {
        name: "Base",
        sortOrder: 0,
        weekCount: 8,
        phaseKind: "BASE",
        focusMode: "PHASE",
        phaseFocus: "AEROBIC_BASE",
        mesocycles: [
          { name: "Base I", weekCount: 4 },
          { name: "Base II", weekCount: 4 },
        ],
        swimSessionsPerWeek: 3,
        bikeSessionsPerWeek: 4,
        runSessionsPerWeek: 3,
      },
    ];
    const baseInput = {
      startDate: new Date("2025-01-06"),
      endDate: new Date("2025-03-02"),
      mesocycleLengthWeeks: 4,
      phases,
      startHours: 8,
      peakHours: 10,
      maxRampPercent: 10,
      deLoadEveryNWeeks: 2,
      deLoadVolumePercent: 60,
      deLoadStrategy: "VOLUME_ONLY" as const,
      reduceCountsOnDeLoad: true,
      longRideStartMin: 60,
      longRidePeakMin: 120,
      longRunStartMin: 30,
      longRunPeakMin: 60,
    };

    const defaults = recomputeSeasonWeeks(baseInput);
    assert.equal(defaults.weeks[2]?.isDeLoadWeek, true);
    assert.equal(defaults.weeks[4]?.isDeLoadWeek, false);
    assert.equal(defaults.weeks[0]?.totalHours, defaults.weeks[1]?.totalHours);
    assert.ok(defaults.weeks[0]!.longRideMinutes > defaults.weeks[1]!.longRideMinutes);
    assert.ok(defaults.weeks[4]!.totalHours >= defaults.weeks[0]!.totalHours);
    assert.ok(defaults.weeks[4]!.longRideMinutes > defaults.weeks[0]!.longRideMinutes);
    assert.ok(defaults.weeks[2]!.longRideMinutes < defaults.weeks[0]!.longRideMinutes);

    const overrides = [false, false, false, true, true, false, false, false];
    const withFlags = recomputeSeasonWeeks({
      ...baseInput,
      deLoadWeekFlags: overrides,
    });
    assert.deepEqual(
      withFlags.weeks.map((w) => w.isDeLoadWeek),
      overrides
    );
  });
});
