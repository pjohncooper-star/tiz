import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDisciplineRampDefaults,
  buildPhaseSpansFromDb,
  defaultSimpleRampDefaults,
  parseSimpleRampDefaultsFromApi,
  rampDefaultsToPlanFields,
  recalculateSimpleVolumes,
  resolveSimpleRampDefaults,
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

describe("simple ramp defaults persistence", () => {
  it("round-trips reference pace seconds through plan fields", () => {
    const defaults = defaultSimpleRampDefaults();
    defaults.swim.referencePaceSeconds = 95;
    defaults.run.referencePaceSeconds = 285;

    const fields = rampDefaultsToPlanFields(defaults);
    assert.equal(fields.swimReferencePaceSeconds, 95);
    assert.equal(fields.runReferencePaceSeconds, 285);

    const resolved = resolveSimpleRampDefaults({
      startHours: fields.startHours,
      peakHours: fields.peakHours,
      maxRampPercent: fields.maxRampPercent,
      swimStartHours: fields.swimStartHours,
      swimPeakHours: fields.swimPeakHours,
      swimRampPercent: fields.swimRampPercent,
      bikeStartHours: fields.bikeStartHours,
      bikePeakHours: fields.bikePeakHours,
      bikeRampPercent: fields.bikeRampPercent,
      runStartHours: fields.runStartHours,
      runPeakHours: fields.runPeakHours,
      runRampPercent: fields.runRampPercent,
      swimPlanningMode: fields.swimPlanningMode,
      runPlanningMode: fields.runPlanningMode,
      swimReferencePaceSeconds: fields.swimReferencePaceSeconds,
      runReferencePaceSeconds: fields.runReferencePaceSeconds,
      swimStartDistanceMeters: fields.swimStartDistanceMeters,
      swimPeakDistanceMeters: fields.swimPeakDistanceMeters,
      runStartDistanceMeters: fields.runStartDistanceMeters,
      runPeakDistanceMeters: fields.runPeakDistanceMeters,
    });

    assert.equal(resolved.swim.referencePaceSeconds, 95);
    assert.equal(resolved.run.referencePaceSeconds, 285);
  });

  it("parses reference pace seconds from API payload", () => {
    const parsed = parseSimpleRampDefaultsFromApi({
      swim: {
        mode: "DISTANCE",
        startHours: 2,
        peakHours: 4,
        ratePercent: 5,
        startDistanceMeters: 3000,
        peakDistanceMeters: 6000,
        referencePaceSeconds: 102,
      },
      bike: { startHours: 4, peakHours: 8, ratePercent: 5 },
      run: {
        mode: "DISTANCE",
        startHours: 2,
        peakHours: 4,
        ratePercent: 5,
        startDistanceMeters: 20000,
        peakDistanceMeters: 40000,
        referencePaceSeconds: 310,
      },
    });

    assert.equal(parsed.swim.referencePaceSeconds, 102);
    assert.equal(parsed.run.referencePaceSeconds, 310);
  });
});

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
    const result = recalculateSimpleVolumes(weeks, [], defaults);
    assert.equal(result[2]!.bikeHours, 2);
    assert.equal(result[3]!.bikeHours, 4.41);
  });

  it("does not overwrite rest week volumes", () => {
    const weeks = [week(0, 2, 4, 2), week(1, 1, 2.5, 1, true)];
    const result = recalculateSimpleVolumes(weeks, [], defaults);
    assert.equal(result[1]!.bikeHours, 2.5);
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
