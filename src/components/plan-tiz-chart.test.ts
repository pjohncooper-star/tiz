import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import {
  disciplineZoneTotal,
  maxChartMinutes,
  maxChartMinutesForDiscipline,
} from "./plan-tiz-chart";

describe("disciplineZoneTotal", () => {
  it("sums only the requested discipline across maps", () => {
    const planned = {
      [zoneKey("BIKE", 2)]: 60,
      [zoneKey("RUN", 2)]: 30,
    };
    const completed = {
      [zoneKey("BIKE", 3)]: 20,
      [zoneKey("RUN", 3)]: 15,
    };
    assert.equal(disciplineZoneTotal("BIKE", planned, completed), 80);
    assert.equal(disciplineZoneTotal("RUN", planned, completed), 45);
  });
});

describe("maxChartMinutesForDiscipline", () => {
  it("returns at least 1 for empty data", () => {
    assert.equal(maxChartMinutesForDiscipline("BIKE"), 1);
  });

  it("uses discipline total not cross-discipline max", () => {
    const values = {
      [zoneKey("BIKE", 2)]: 90,
      [zoneKey("RUN", 2)]: 30,
    };
    assert.equal(maxChartMinutesForDiscipline("RUN", values), 30);
    assert.equal(maxChartMinutesForDiscipline("BIKE", values), 90);
  });
});

describe("maxChartMinutes", () => {
  it("returns the largest discipline total across bike run swim", () => {
    const values = {
      [zoneKey("BIKE", 2)]: 120,
      [zoneKey("RUN", 2)]: 45,
      [zoneKey("SWIM", 2)]: 20,
    };
    assert.equal(maxChartMinutes(values), 120);
  });
});
