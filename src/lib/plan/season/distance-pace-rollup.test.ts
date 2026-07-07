import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  distanceFromDurationPace,
  distanceMetersFromHoursPace,
  durationFromDistancePace,
  hoursFromDistancePace,
} from "./distance-pace-rollup";

describe("distance-pace-rollup", () => {
  it("converts run distance and pace to hours", () => {
    assert.equal(hoursFromDistancePace("RUN", 10_000, 300), 0.8);
  });

  it("converts swim distance and pace to hours", () => {
    assert.equal(hoursFromDistancePace("SWIM", 4000, 90), 1);
  });

  it("round-trips run distance via duration", () => {
    const meters = distanceMetersFromHoursPace("RUN", 1, 300);
    assert.equal(Math.round(meters), 12_000);
    assert.equal(durationFromDistancePace("RUN", meters, 300), 3600);
  });

  it("round-trips swim distance via duration", () => {
    const meters = distanceFromDurationPace("SWIM", 3600, 90);
    assert.equal(meters, 4000);
  });
});
