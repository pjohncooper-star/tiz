import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapStravaStreams } from "./map-streams";

describe("mapStravaStreams", () => {
  it("maps key_by_type objects including latlng", () => {
    const streams = mapStravaStreams({
      time: { data: [0, 1, 2] },
      watts: { data: [180, 190, 200] },
      latlng: {
        data: [
          [37.7, -122.4],
          [0, 0],
          [37.71, -122.41],
        ],
      },
    });
    assert.deepEqual(streams.time?.data, [0, 1, 2]);
    assert.deepEqual(streams.watts?.data, [180, 190, 200]);
    assert.deepEqual(streams.latlng?.data, [
      [37.7, -122.4],
      null,
      [37.71, -122.41],
    ]);
  });

  it("maps the array-of-streams response shape", () => {
    const streams = mapStravaStreams([
      { type: "time", data: [0, 5] },
      { type: "distance", data: [0, 12] },
      { type: "latlng", data: [[40.0, -74.0], [40.01, -74.01]] },
    ]);
    assert.deepEqual(streams.distance?.data, [0, 12]);
    assert.deepEqual(streams.latlng?.data, [
      [40.0, -74.0],
      [40.01, -74.01],
    ]);
  });
});
