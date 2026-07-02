import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDisciplineGoalTimesSummary,
  goalEventTimesForApi,
  goalMinutesForDiscipline,
  hasPartialDisciplineGoalTimes,
  resolveEstimatedDurationMinutes,
  sumDisciplineGoalMinutes,
} from "./goal-event-times";

describe("goal-event-times", () => {
  it("sums discipline goal minutes when all legs filled", () => {
    assert.equal(
      sumDisciplineGoalMinutes(["SWIM", "BIKE", "RUN"], {
        swimGoalMinutes: 30,
        bikeGoalMinutes: 180,
        runGoalMinutes: 90,
      }),
      300
    );
  });

  it("returns null when any leg time missing", () => {
    assert.equal(
      sumDisciplineGoalMinutes(["SWIM", "BIKE", "RUN"], {
        swimGoalMinutes: 30,
        bikeGoalMinutes: null,
        runGoalMinutes: 90,
      }),
      null
    );
  });

  it("resolves estimated total from leg times", () => {
    assert.equal(
      resolveEstimatedDurationMinutes({
        disciplines: ["SWIM", "BIKE", "RUN"],
        swimGoalMinutes: 32,
        bikeGoalMinutes: 165,
        runGoalMinutes: 95,
        estimatedDurationMinutes: null,
      }),
      292
    );
  });

  it("falls back to single estimated duration", () => {
    assert.equal(
      resolveEstimatedDurationMinutes({
        disciplines: ["RUN"],
        estimatedDurationMinutes: 210,
      }),
      210
    );
  });

  it("goalEventTimesForApi persists leg times and computed total", () => {
    const result = goalEventTimesForApi({
      disciplines: ["SWIM", "BIKE", "RUN"],
      swimGoalMinutes: 30,
      bikeGoalMinutes: 180,
      runGoalMinutes: 90,
    });
    assert.equal(result.estimatedDurationMinutes, 300);
    assert.equal(result.bikeGoalMinutes, 180);
  });

  it("goalEventTimesForApi maps single-discipline estimated time to leg column", () => {
    const result = goalEventTimesForApi({
      disciplines: ["RUN"],
      estimatedDurationMinutes: 210,
    });
    assert.equal(result.estimatedDurationMinutes, 210);
    assert.equal(result.runGoalMinutes, 210);
    assert.equal(result.swimGoalMinutes, null);
    assert.equal(result.bikeGoalMinutes, null);
  });

  it("detects partial discipline goal times", () => {
    assert.equal(
      hasPartialDisciplineGoalTimes({
        disciplines: ["SWIM", "BIKE", "RUN"],
        swimGoalMinutes: 30,
        bikeGoalMinutes: null,
        runGoalMinutes: null,
      }),
      true
    );
    assert.equal(
      hasPartialDisciplineGoalTimes({
        disciplines: ["SWIM", "BIKE"],
        swimGoalMinutes: null,
        bikeGoalMinutes: null,
      }),
      false
    );
  });

  it("formats discipline goal summary", () => {
    const summary = formatDisciplineGoalTimesSummary(["SWIM", "RUN"], {
      swimGoalMinutes: 32,
      runGoalMinutes: 95,
    });
    assert.match(summary ?? "", /Swim/);
    assert.match(summary ?? "", /Run/);
  });

  it("reads goal minutes per discipline", () => {
    assert.equal(goalMinutesForDiscipline({ bikeGoalMinutes: 120 }, "BIKE"), 120);
  });
});
