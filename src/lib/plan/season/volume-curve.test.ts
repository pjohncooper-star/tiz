import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseKind } from "@prisma/client";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";
import { computeWeeklyVolumeCurve, peakWeekIndex } from "./volume-curve";

const basePhase: SeasonPhaseInput = {
  name: "Base",
  sortOrder: 0,
  weekCount: 4,
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
  weekCount: 4,
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
  weekCount: 2,
  phaseKind: "RACE_PREP",
  focusMode: "PHASE",
  phaseFocus: "RACE_SPECIFICITY",
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

const baseBuildMesocycles: ComputedMesocycle[] = [
  {
    phaseIndex: 0,
    name: "Base I",
    index: 0,
    startWeekIndex: 0,
    endWeekIndex: 1,
  },
  {
    phaseIndex: 0,
    name: "Base II",
    index: 1,
    startWeekIndex: 2,
    endWeekIndex: 3,
  },
  {
    phaseIndex: 1,
    name: "Build I",
    index: 0,
    startWeekIndex: 4,
    endWeekIndex: 7,
  },
];

function curve(
  phaseKindsByWeek: PhaseKind[],
  mesocycles: ComputedMesocycle[],
  phases: SeasonPhaseInput[],
  overrides: Partial<Parameters<typeof computeWeeklyVolumeCurve>[0]> = {}
) {
  return computeWeeklyVolumeCurve({
    totalWeeks: phaseKindsByWeek.length,
    phaseKindsByWeek,
    phases,
    mesocycles,
    startHours: 8,
    peakHours: 12,
    maxRampPercent: 10,
    deLoadFlags: phaseKindsByWeek.map(() => false),
    deLoadVolumePercent: 60,
    ...overrides,
  });
}

describe("volume-curve", () => {
  it("steps base then holds build at peak across mesocycle boundaries", () => {
    const kinds: PhaseKind[] = [
      "BASE",
      "BASE",
      "BASE",
      "BASE",
      "BUILD",
      "BUILD",
      "BUILD",
      "BUILD",
    ];
    const hours = curve(kinds, baseBuildMesocycles, [basePhase, buildPhase]);
    assert.equal(hours[0], 8);
    assert.equal(hours[1], 8);
    assert.equal(hours[2], 12);
    assert.equal(hours[3], 12);
    assert.equal(hours[4], 12);
    assert.equal(hours[7], 12);
  });

  it("ramps build when custom entry is below peak", () => {
    const kinds: PhaseKind[] = [
      "BASE",
      "BASE",
      "BASE",
      "BASE",
      "BUILD",
      "BUILD",
      "BUILD",
      "BUILD",
    ];
    const mesocycles: ComputedMesocycle[] = [
      {
        phaseIndex: 0,
        name: "Base I",
        index: 0,
        startWeekIndex: 0,
        endWeekIndex: 3,
      },
      {
        phaseIndex: 1,
        name: "Build I",
        index: 0,
        startWeekIndex: 4,
        endWeekIndex: 5,
      },
      {
        phaseIndex: 1,
        name: "Build II",
        index: 1,
        startWeekIndex: 6,
        endWeekIndex: 7,
      },
    ];
    const hours = curve(kinds, mesocycles, [
      basePhase,
      {
        ...buildPhase,
        volumeMesocycleMode: "INCREASE",
        volumeStartHours: 10,
      },
    ]);
    assert.equal(hours[4], 10);
    assert.equal(hours[6], 12);
    assert.equal(hours[7], 12);
  });

  it("applies race prep at 90% of peak when held flat", () => {
    const hours = curve(
      ["BUILD", "RACE_PREP", "RACE_PREP"],
      [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 0,
        },
        {
          phaseIndex: 1,
          name: "Race prep I",
          index: 0,
          startWeekIndex: 1,
          endWeekIndex: 2,
        },
      ],
      [
        { ...buildPhase, weekCount: 1, sortOrder: 0 },
        {
          ...racePrepPhase,
          weekCount: 2,
          sortOrder: 1,
          volumeMesocycleMode: "HOLD",
        },
      ],
      { startHours: 10, peakHours: 10 }
    );
    assert.equal(hours[1], 9);
    assert.equal(hours[2], 9);
  });

  it("tapers from 70% to 45% of peak", () => {
    const hours = curve(
      ["BUILD", "TAPER", "TAPER"],
      [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 0,
        },
        {
          phaseIndex: 1,
          name: "Taper I",
          index: 0,
          startWeekIndex: 1,
          endWeekIndex: 2,
        },
      ],
      [
        { ...buildPhase, weekCount: 1, sortOrder: 0 },
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
      ],
      { startHours: 10, peakHours: 10 }
    );
    assert.equal(hours[1], 7);
    assert.equal(hours[2], 4.5);
  });

  it("reduces de-load weeks by volume percent without advancing the meso step", () => {
    const hours = curve(
      ["BUILD", "BUILD", "BUILD", "BUILD"],
      [
        {
          phaseIndex: 0,
          name: "Build I",
          index: 0,
          startWeekIndex: 0,
          endWeekIndex: 3,
        },
      ],
      [{ ...buildPhase, weekCount: 4 }],
      {
        startHours: 10,
        peakHours: 10,
        deLoadFlags: [false, true, false, false],
      }
    );
    assert.equal(hours[0], 10);
    assert.equal(hours[1], 6);
    assert.equal(hours[2], 10);
    assert.equal(hours[3], 10);
  });

  it("finds peak week index", () => {
    const hours = [8, 9, 10, 9, 7, 4.5];
    assert.equal(peakWeekIndex(hours), 2);
  });
});
