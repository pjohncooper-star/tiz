import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDisciplineRampDefaults,
  buildPhaseSpansFromDb,
  defaultSimpleRampDefaults,
  recalculateSimpleVolumes,
  type SimpleWeekVolume,
} from "./simple-ramp";

function week(
  weekIndex: number,
  swimHours: number,
  bikeHours: number,
  runHours: number,
  isRestWeek = false
): SimpleWeekVolume {
  return {
    weekIndex,
    isRestWeek,
    swimHours,
    bikeHours,
    runHours,
    totalHours: swimHours + bikeHours + runHours,
  };
}

describe("recalculateSimpleVolumes", () => {
  const defaults = defaultSimpleRampDefaults();

  it("ramps one step from previous week", () => {
    const weeks = [week(0, 2, 4, 2), week(1, 2, 4, 2)];
    const result = recalculateSimpleVolumes(weeks, [], defaults);
    assert.equal(result[1]!.bikeHours, 4.2);
  });

  it("skips rest week when finding ramp base", () => {
    const weeks = [
      week(0, 2, 4, 2),
      week(1, 2, 4.2, 2.1),
      week(2, 1, 2, 1, true),
      week(3, 2, 4, 2),
    ];
    const result = recalculateSimpleVolumes(weeks, [], defaults, 75);
    assert.equal(result[2]!.bikeHours, 3.15);
    assert.equal(result[3]!.bikeHours, 4.41);
  });

  it("applies configurable rest volume cut from prior training week", () => {
    const weeks = [
      week(0, 2, 4, 2),
      week(1, 2, 4.2, 2.1),
      week(2, 2, 4, 2, true),
    ];
    const result = recalculateSimpleVolumes(weeks, [], defaults, 60);
    assert.equal(result[2]!.bikeHours, 2.52);
  });

  it("cuts rest week after a ramp block", () => {
    const weeks = [
      week(0, 2, 4, 2),
      week(1, 2, 4.2, 2.1),
      week(2, 2, 4.41, 2.21),
      week(3, 2, 4, 2, true),
      week(4, 2, 4, 2),
    ];
    const result = recalculateSimpleVolumes(weeks, [], defaults, 75);
    assert.equal(result[2]!.bikeHours, 4.41);
    assert.equal(result[3]!.bikeHours, 3.31);
    assert.equal(result[4]!.bikeHours, 4.63);
  });

  it("respects ramp-off phase per discipline", () => {
    const weeks = [week(0, 2, 4, 2), week(1, 2, 4, 2)];
    const phases = buildPhaseSpansFromDb([
      {
        sortOrder: 0,
        weekCount: 1,
        rampSwimEnabled: true,
        rampBikeEnabled: true,
        rampRunEnabled: true,
      },
      {
        sortOrder: 1,
        weekCount: 1,
        rampSwimEnabled: true,
        rampBikeEnabled: false,
        rampRunEnabled: true,
      },
    ]);
    const result = recalculateSimpleVolumes(weeks, phases, defaults);
    assert.equal(result[1]!.bikeHours, 4);
    assert.equal(result[1]!.runHours, 2.1);
  });

  it("caps at peak hours", () => {
    const cappedDefaults = defaultSimpleRampDefaults();
    cappedDefaults.swim = buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 2,
      peakHours: 4,
      ratePercent: 50,
      paceDiscipline: "SWIM",
    });
    cappedDefaults.bike = buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 3.9,
      peakHours: 4,
      ratePercent: 50,
      paceDiscipline: "RUN",
    });
    cappedDefaults.run = buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 2,
      peakHours: 4,
      ratePercent: 50,
      paceDiscipline: "RUN",
    });
    const weeks = [week(0, 3.9, 3.9, 3.9), week(1, 2, 2, 2)];
    const result = recalculateSimpleVolumes(weeks, [], cappedDefaults);
    assert.equal(result[1]!.bikeHours, 4);
  });
});
