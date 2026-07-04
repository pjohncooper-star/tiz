import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DISCIPLINE_UNIT_SETTINGS } from "@/lib/units/discipline-settings";
import {
  formatGoalRaceDistance,
  goalRaceDistanceDiscipline,
  goalRaceDistanceInputToMeters,
  goalRaceDistanceMetersToInput,
} from "./goal-race-distance";

describe("goal-race-distance", () => {
  it("uses the only discipline for unit selection", () => {
    assert.equal(goalRaceDistanceDiscipline(["RUN"]), "RUN");
    assert.equal(goalRaceDistanceDiscipline(["SWIM"]), "SWIM");
  });

  it("prefers run units for multisport races", () => {
    assert.equal(goalRaceDistanceDiscipline(["SWIM", "BIKE", "RUN"]), "RUN");
    assert.equal(goalRaceDistanceDiscipline(["SWIM", "BIKE"]), "BIKE");
  });

  it("converts run distance using metric settings", () => {
    const settings = {
      ...DEFAULT_DISCIPLINE_UNIT_SETTINGS,
      RUN: { displayUnit: "METRIC" as const, poolSize: null },
    };
    assert.equal(
      goalRaceDistanceInputToMeters("42.2", ["RUN"], settings),
      42200
    );
    assert.equal(
      goalRaceDistanceMetersToInput(42200, ["RUN"], settings),
      "42.2"
    );
    assert.equal(
      formatGoalRaceDistance(42200, ["RUN"], settings),
      "42.2 km"
    );
  });

  it("converts run distance using imperial settings", () => {
    const settings = {
      ...DEFAULT_DISCIPLINE_UNIT_SETTINGS,
      RUN: { displayUnit: "IMPERIAL" as const, poolSize: null },
    };
    assert.equal(
      goalRaceDistanceInputToMeters("26.2", ["RUN"], settings),
      42164.8128
    );
    assert.match(
      formatGoalRaceDistance(42195, ["RUN"], settings) ?? "",
      /mi/
    );
  });
});
