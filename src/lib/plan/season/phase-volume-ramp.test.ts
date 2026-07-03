import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultVolumeMesocycleMode,
  phaseMesocyclePlateau,
  plateauForWeek,
  resolvePhaseTargets,
} from "./phase-volume-ramp";
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

const buildPhase: SeasonPhaseInput = {
  name: "Build",
  sortOrder: 1,
  weekCount: 8,
  phaseKind: "BUILD",
  focusMode: "PHASE",
  phaseFocus: "THRESHOLD",
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

const racePrepPhase: SeasonPhaseInput = {
  name: "Race prep",
  sortOrder: 2,
  weekCount: 4,
  phaseKind: "RACE_PREP",
  focusMode: "PHASE",
  phaseFocus: "RACE_SPECIFICITY",
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

const anchors = {
  startHours: 8,
  peakHours: 12,
  longRideStartMin: 60,
  longRidePeakMin: 120,
  longRunStartMin: 30,
  longRunPeakMin: 60,
};

describe("phase-volume-ramp", () => {
  it("defaults modes by phase kind", () => {
    assert.equal(defaultVolumeMesocycleMode("BASE"), "INCREASE");
    assert.equal(defaultVolumeMesocycleMode("BUILD"), "HOLD");
    assert.equal(defaultVolumeMesocycleMode("RACE_PREP"), "DECREASE");
  });

  it("chains default targets across base hold and race prep decrease", () => {
    const resolved = resolvePhaseTargets([basePhase, buildPhase, racePrepPhase], anchors);
    assert.equal(resolved.length, 3);
    assert.equal(resolved[0]!.volumeEntry, 8);
    assert.equal(resolved[0]!.volumeExit, 12);
    assert.equal(resolved[1]!.volumeEntry, 12);
    assert.equal(resolved[1]!.volumeExit, 12);
    assert.equal(resolved[2]!.volumeEntry, 12);
    assert.equal(resolved[2]!.volumeExit, 10.8);
  });

  it("honors custom build entry after base peak", () => {
    const resolved = resolvePhaseTargets(
      [
        basePhase,
        {
          ...buildPhase,
          volumeMesocycleMode: "INCREASE",
          volumeStartHours: 10,
        },
        racePrepPhase,
      ],
      anchors
    );
    assert.equal(resolved[1]!.volumeEntry, 10);
    assert.equal(resolved[1]!.volumeExit, 12);
  });

  it("derives end from weekly ramp when end hours unset", () => {
    const resolved = resolvePhaseTargets(
      [
        {
          ...basePhase,
          weekCount: 3,
          volumeRampPercent: 10,
        },
      ],
      anchors
    );
    assert.equal(resolved[0]!.volumeEntry, 8);
    assert.equal(resolved[0]!.volumeExit, 9.68);
  });

  it("plateauForWeek compounds volume weekly when ramp percent set", () => {
    const phases = [
      {
        ...basePhase,
        weekCount: 3,
        volumeRampPercent: 10,
      },
    ];
    const mesos: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Base I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 2,
      },
    ];
    const resolved = resolvePhaseTargets(phases, anchors);
    assert.equal(
      plateauForWeek(0, phases, mesos, resolved, "volume"),
      8
    );
    assert.equal(
      plateauForWeek(1, phases, mesos, resolved, "volume"),
      8.8
    );
    assert.equal(
      plateauForWeek(2, phases, mesos, resolved, "volume"),
      9.68
    );
  });

  it("steps within phase mesocycles for increase and holds for hold", () => {
    const baseMesos: ComputedMesocycle[] = [
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

    assert.equal(
      phaseMesocyclePlateau(0, baseMesos, 8, 12, "INCREASE"),
      8
    );
    assert.equal(
      phaseMesocyclePlateau(4, baseMesos, 8, 12, "INCREASE"),
      12
    );
    assert.equal(
      phaseMesocyclePlateau(0, baseMesos, 12, 12, "HOLD"),
      12
    );
    assert.equal(
      phaseMesocyclePlateau(4, baseMesos, 12, 12, "HOLD"),
      12
    );
  });
});
