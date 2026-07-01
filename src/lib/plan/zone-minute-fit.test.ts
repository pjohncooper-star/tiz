import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyZoneMinuteValues,
  fitZoneMinuteValuesToDuration,
  parseZoneMinuteValues,
  totalZoneMinuteInputValues,
  zoneMinuteValuesFromRecord,
} from "@/components/zone-minute-pills";

describe("fitZoneMinuteValuesToDuration", () => {
  it("scales zones proportionally when total exceeds duration", () => {
    const values = zoneMinuteValuesFromRecord({ 2: 30, 3: 30 });
    const fitted = fitZoneMinuteValuesToDuration(values, 45);
    const parsed = parseZoneMinuteValues(fitted);
    assert.equal(totalZoneMinuteInputValues(fitted), 45);
    assert.equal((parsed[2] ?? 0) + (parsed[3] ?? 0), 45);
  });

  it("leaves zones unchanged when total already fits", () => {
    const values = zoneMinuteValuesFromRecord({ 2: 20, 3: 20 });
    const fitted = fitZoneMinuteValuesToDuration(values, 45);
    assert.equal(totalZoneMinuteInputValues(fitted), 40);
    assert.equal(fitted[2], "20");
    assert.equal(fitted[3], "20");
  });

  it("leaves empty zones unchanged", () => {
    const values = emptyZoneMinuteValues();
    const fitted = fitZoneMinuteValuesToDuration(values, 45);
    assert.deepEqual(fitted, values);
  });

  it("handles a single-zone budget", () => {
    const values = zoneMinuteValuesFromRecord({ 2: 60 });
    const fitted = fitZoneMinuteValuesToDuration(values, 45);
    assert.equal(totalZoneMinuteInputValues(fitted), 45);
    assert.equal(fitted[2], "45");
  });

  it("returns unchanged when duration is null", () => {
    const values = zoneMinuteValuesFromRecord({ 2: 60 });
    const fitted = fitZoneMinuteValuesToDuration(values, null);
    assert.deepEqual(fitted, values);
  });
});
