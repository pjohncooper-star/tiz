import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGoalDisciplines,
  sortDisciplines,
  toggleGoalDiscipline,
} from "@/lib/plan/season/season-types";

describe("season-types", () => {
  it("sorts disciplines in SWIM, BIKE, RUN order", () => {
    assert.deepEqual(sortDisciplines(["RUN", "SWIM"]), ["SWIM", "RUN"]);
  });

  it("formats goal disciplines for display", () => {
    assert.equal(formatGoalDisciplines(["RUN"]), "Run");
    assert.equal(formatGoalDisciplines(["BIKE", "RUN"]), "Bike & Run");
    assert.equal(formatGoalDisciplines(["SWIM", "BIKE", "RUN"]), "Swim, Bike & Run");
  });

  it("toggles goal disciplines", () => {
    assert.deepEqual(toggleGoalDiscipline(["RUN"], "BIKE"), ["BIKE", "RUN"]);
    assert.equal(toggleGoalDiscipline(["RUN"], "RUN"), null);
  });
});
