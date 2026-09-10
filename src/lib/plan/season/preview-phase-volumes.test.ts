import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewPhaseAwareVolumes } from "./preview-phase-volumes";
import { defaultSimpleRampDefaults } from "./simple-ramp";
import type { SimplePhase, SimpleWeek } from "@/components/simple-planner/simple-planner-types";

function week(weekIndex: number, bikeHours: number): SimpleWeek {
  return {
    weekIndex,
    weekStartDate: "2026-01-05",
    isRestWeek: false,
    swimHours: 2,
    bikeHours,
    runHours: 1,
    totalHours: 3 + bikeHours,
    zoneMinutes: {},
  };
}

function phase(): SimplePhase {
  return {
    id: "base-1",
    name: "Base 1",
    color: "#38bdf8",
    phaseKind: "BASE",
    startWeekIndex: 0,
    endWeekIndex: 1,
    rampEnabled: { swim: true, bike: false, run: true },
    volumeProgressionMode: "TARGET",
    swimStartHours: 2,
    swimEndHours: 2,
    bikeStartHours: 4,
    bikeEndHours: 8,
    runStartHours: 1,
    runEndHours: 2.5,
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 0,
    runSessionsPerWeek: 3,
    strengthSessionsPerWeek: 0,
    swimIntenseDaysPerWeek: 1,
    bikeIntenseDaysPerWeek: 0,
    runIntenseDaysPerWeek: 1,
    goal: null,
    zoneSplits: null,
  };
}

describe("previewPhaseAwareVolumes", () => {
  it("keeps TrainerRoad bike hours when preserveBikeHours is set", () => {
    const result = previewPhaseAwareVolumes({
      weeks: [week(0, 4.25), week(1, 3.5)],
      phases: [phase()],
      rampDefaults: defaultSimpleRampDefaults(),
      restVolumePercent: 75,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      preserveBikeHours: true,
    });

    assert.equal(result.weeks[0]!.bikeHours, 4.25);
    assert.equal(result.weeks[1]!.bikeHours, 3.5);
    assert.ok(result.weeks[0]!.bikeHours < 8);
    assert.equal(result.weeks[0]!.runHours, 1);
  });

  it("fills the default 8h bike peak when bike hours are not preserved", () => {
    const result = previewPhaseAwareVolumes({
      weeks: [week(0, 4.25), week(1, 3.5)],
      phases: [phase()],
      rampDefaults: defaultSimpleRampDefaults(),
      restVolumePercent: 75,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
    });

    assert.equal(result.weeks[0]!.bikeHours, 8);
    assert.equal(result.weeks[1]!.bikeHours, 8);
  });
});
