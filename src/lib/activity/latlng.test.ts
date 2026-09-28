import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitCoordinateToDegrees,
  hasActivityRoute,
  latLngFromFitRecord,
  normalizeLatLng,
  parseLatLngSeries,
  pointAtCursor,
  routeFromPoints,
  sliceRoute,
  type RouteSample,
} from "./latlng";

function sample(
  timeSec: number,
  lat: number | null,
  lng: number | null,
  distanceM = timeSec
): RouteSample {
  return { timeSec, distanceM, lat, lng };
}

describe("normalizeLatLng", () => {
  it("rejects missing, non-finite, and 0,0 coordinates", () => {
    assert.equal(normalizeLatLng(null, -122), null);
    assert.equal(normalizeLatLng(37.5, Number.NaN), null);
    assert.equal(normalizeLatLng(0, 0), null);
  });

  it("rejects out-of-range values", () => {
    assert.equal(normalizeLatLng(91, -122), null);
    assert.equal(normalizeLatLng(37, 181), null);
  });

  it("keeps a valid outdoor coordinate", () => {
    assert.deepEqual(normalizeLatLng(37.77, -122.42), [37.77, -122.42]);
  });
});

describe("fitCoordinateToDegrees", () => {
  it("converts Garmin semicircles to degrees", () => {
    const lat = 40.7128 * (2147483648 / 180);
    const deg = fitCoordinateToDegrees(lat);
    assert.ok(deg != null);
    assert.ok(Math.abs(deg - 40.7128) < 1e-6);
  });

  it("passes through values already in degrees", () => {
    assert.equal(fitCoordinateToDegrees(-74.006), -74.006);
  });
});

describe("latLngFromFitRecord", () => {
  it("reads positionLat/positionLong semicircles", () => {
    const coord = latLngFromFitRecord({
      positionLat: 37.8 * (2147483648 / 180),
      positionLong: -122.4 * (2147483648 / 180),
    });
    assert.ok(coord);
    assert.ok(Math.abs(coord[0] - 37.8) < 1e-5);
    assert.ok(Math.abs(coord[1] + 122.4) < 1e-5);
  });

  it("treats missing and 0,0 indoor samples as null", () => {
    assert.equal(latLngFromFitRecord({}), null);
    assert.equal(latLngFromFitRecord({ positionLat: 0, positionLong: 0 }), null);
  });
});

describe("parseLatLngSeries", () => {
  it("maps Strava [lat,lng] samples and nulls dropouts", () => {
    const series = parseLatLngSeries([
      [37.7, -122.4],
      null,
      [0, 0],
      [37.71, -122.41],
    ]);
    assert.ok(series);
    assert.deepEqual(series[0], [37.7, -122.4]);
    assert.equal(series[1], null);
    assert.equal(series[2], null);
    assert.deepEqual(series[3], [37.71, -122.41]);
  });
});

describe("hasActivityRoute", () => {
  it("requires enough moving points", () => {
    const indoor = Array.from({ length: 20 }, (_, i) =>
      sample(i, 37.5, -122.4)
    );
    assert.equal(hasActivityRoute(indoor), false);

    const outdoor = Array.from({ length: 12 }, (_, i) =>
      sample(i, 37.5 + i * 0.001, -122.4)
    );
    assert.equal(hasActivityRoute(outdoor), true);

    const sparse = Array.from({ length: 8 }, (_, i) =>
      sample(i, 37.5 + i * 0.01, -122.4)
    );
    assert.equal(hasActivityRoute(sparse), false);
  });
});

describe("routeFromPoints", () => {
  it("splits the polyline on GPS gaps instead of drawing a chord", () => {
    const points = [
      sample(0, 37.5, -122.4),
      sample(1, 37.51, -122.41),
      sample(2, null, null),
      sample(3, 37.7, -122.2),
      sample(4, 37.71, -122.21),
    ];
    const lines = routeFromPoints(points);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], [
      [-122.4, 37.5],
      [-122.41, 37.51],
    ]);
    assert.deepEqual(lines[1], [
      [-122.2, 37.7],
      [-122.21, 37.71],
    ]);
  });
});

describe("pointAtCursor and sliceRoute", () => {
  const points = [
    sample(0, 37.5, -122.4, 0),
    sample(10, 37.51, -122.41, 100),
    sample(20, 37.52, -122.42, 200),
    sample(30, 37.53, -122.43, 300),
  ];

  it("maps a hover time to the nearest GPS sample", () => {
    const at = pointAtCursor(points, { timeSec: 12, distanceM: 120 }, "time");
    assert.deepEqual(at, { lat: 37.51, lng: -122.41 });
  });

  it("slices the selected time range", () => {
    const lines = sliceRoute(
      points,
      {
        startTimeSec: 10,
        endTimeSec: 20,
        startDistanceM: 100,
        endDistanceM: 200,
      },
      "time"
    );
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0], [
      [-122.41, 37.51],
      [-122.42, 37.52],
    ]);
  });
});
