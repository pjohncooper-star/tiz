import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formulaHoursAtTrainingWeek,
  formulaWeekFromHours,
  parseSessionFormulaCatalog,
  type DisciplineFormula,
} from "./base-formulas";

function formula(overrides: Partial<DisciplineFormula> = {}): DisciplineFormula {
  return {
    id: "sf_test",
    name: "Even",
    discipline: "RUN",
    growthPercentPerWeek: 0,
    peakCapHours: null,
    sessions: [
      { sharePercent: 25, zone: 2, intensity: false, long: false },
      { sharePercent: 25, zone: 2, intensity: false, long: false },
      { sharePercent: 50, zone: 2, intensity: false, long: true },
    ],
    ...overrides,
  };
}

describe("formula week shares", () => {
  it("splits 4 hours into 60, 60, and 120 minutes with the long on the half share", () => {
    const week = formulaWeekFromHours(formula(), 4);
    assert.deepEqual(
      week.sessions.map((session) => session.minutes),
      [60, 60, 120]
    );
    assert.equal(week.longMinutes, 120);
    assert.equal(week.zoneMinutes[2], 240);
    assert.equal(week.zoneMinutes[1], 0);
    assert.equal(week.intenseCount, 0);
  });

  it("puts only the intensity share into its zone", () => {
    const week = formulaWeekFromHours(
      formula({
        sessions: [
          { sharePercent: 75, zone: 1, intensity: false, long: true },
          { sharePercent: 25, zone: 3, intensity: true, long: false },
        ],
      }),
      4
    );
    assert.equal(week.zoneMinutes[3], 60);
    assert.equal(week.zoneMinutes[1], 180);
    assert.equal(week.intenseCount, 1);
    assert.equal(week.sessionCount, 2);
  });
});

describe("formula growth", () => {
  it("compounds weekly growth and holds at the cap", () => {
    assert.equal(
      formulaHoursAtTrainingWeek({
        startHours: 4,
        growthPercentPerWeek: 10,
        peakCapHours: 4.5,
        trainingWeekOffset: 0,
      }),
      4
    );
    assert.equal(
      formulaHoursAtTrainingWeek({
        startHours: 4,
        growthPercentPerWeek: 10,
        peakCapHours: 4.5,
        trainingWeekOffset: 1,
      }),
      4.4
    );
    assert.equal(
      formulaHoursAtTrainingWeek({
        startHours: 4,
        growthPercentPerWeek: 10,
        peakCapHours: 4.5,
        trainingWeekOffset: 2,
      }),
      4.5
    );
  });
});

describe("session formula catalog", () => {
  it("drops entries that do not validate", () => {
    const catalog = parseSessionFormulaCatalog([
      formula(),
      { id: "bad", name: "", discipline: "RUN", sessions: [] },
    ]);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0]!.name, "Even");
  });
});
