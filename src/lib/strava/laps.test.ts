import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapStravaLapsToSwimLaps } from "./laps";

describe("mapStravaLapsToSwimLaps", () => {
  const activityStart = new Date("2025-01-15T10:00:00.000Z");

  it("maps active and rest laps with start_date offsets", () => {
    const laps = mapStravaLapsToSwimLaps(
      [
        {
          lap_index: 1,
          elapsed_time: 45,
          moving_time: 42,
          distance: 50,
          average_speed: 1.19,
          start_date: "2025-01-15T10:00:00.000Z",
        },
        {
          lap_index: 2,
          elapsed_time: 20,
          moving_time: 15,
          distance: 0,
          average_speed: 0,
          start_date: "2025-01-15T10:00:42.000Z",
        },
        {
          lap_index: 3,
          elapsed_time: 40,
          moving_time: 38,
          distance: 50,
          average_speed: 1.32,
          start_date: "2025-01-15T10:00:57.000Z",
        },
      ],
      activityStart
    );

    assert.ok(laps);
    assert.equal(laps.length, 3);
    assert.equal(laps[0]!.startSec, 0);
    assert.equal(laps[0]!.durationSec, 42);
    assert.equal(laps[0]!.speedMps, 1.19);
    assert.equal(laps[1]!.startSec, 42);
    assert.equal(laps[1]!.speedMps, 0);
    assert.equal(laps[2]!.startSec, 57);
    assert.equal(laps[2]!.speedMps, 1.32);
  });

  it("derives speed from distance and duration when average_speed is missing", () => {
    const laps = mapStravaLapsToSwimLaps(
      [
        {
          lap_index: 1,
          elapsed_time: 50,
          moving_time: 50,
          distance: 50,
          start_date: "2025-01-15T10:00:00.000Z",
        },
      ],
      activityStart
    );

    assert.ok(laps);
    assert.equal(laps[0]!.speedMps, 1);
  });

  it("uses cumulative start when start_date is absent", () => {
    const laps = mapStravaLapsToSwimLaps(
      [
        {
          lap_index: 1,
          elapsed_time: 30,
          moving_time: 30,
          distance: 25,
          average_speed: 0.83,
        },
        {
          lap_index: 2,
          elapsed_time: 35,
          moving_time: 35,
          distance: 25,
          average_speed: 0.71,
        },
      ],
      activityStart
    );

    assert.ok(laps);
    assert.equal(laps[0]!.startSec, 0);
    assert.equal(laps[1]!.startSec, 30);
  });

  it("returns null for empty lap list", () => {
    assert.equal(mapStravaLapsToSwimLaps([], activityStart), null);
  });
});
