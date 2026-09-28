import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGpxFile } from "./gpx";
import { parseTcxFile } from "./tcx";
import { parseRecordStreamPoints } from "@/lib/activity/record-streams";

const GPX = `<?xml version="1.0"?>
<gpx>
  <trk>
    <name>Coast run</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="37.7700" lon="-122.4200"><time>2026-04-01T16:00:00Z</time></trkpt>
      <trkpt lat="37.7710" lon="-122.4210"><time>2026-04-01T16:00:10Z</time></trkpt>
      <trkpt lat="0" lon="0"><time>2026-04-01T16:00:20Z</time></trkpt>
      <trkpt lat="37.7730" lon="-122.4230"><time>2026-04-01T16:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const TCX = `<?xml version="1.0"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-04-01T16:00:00Z</Id>
      <Lap>
        <TotalTimeSeconds>20</TotalTimeSeconds>
        <DistanceMeters>120</DistanceMeters>
        <Track>
          <Trackpoint>
            <Time>2026-04-01T16:00:00Z</Time>
            <Position>
              <LatitudeDegrees>37.77</LatitudeDegrees>
              <LongitudeDegrees>-122.42</LongitudeDegrees>
            </Position>
            <HeartRateBpm><Value>140</Value></HeartRateBpm>
            <DistanceMeters>0</DistanceMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-04-01T16:00:10Z</Time>
            <Position>
              <LatitudeDegrees>37.771</LatitudeDegrees>
              <LongitudeDegrees>-122.421</LongitudeDegrees>
            </Position>
            <HeartRateBpm><Value>145</Value></HeartRateBpm>
            <DistanceMeters>60</DistanceMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-04-01T16:00:20Z</Time>
            <HeartRateBpm><Value>150</Value></HeartRateBpm>
            <DistanceMeters>120</DistanceMeters>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

describe("parseGpxFile", () => {
  it("stores time-aligned latlng and nulls 0,0 samples", () => {
    const parsed = parseGpxFile(GPX, "fallback.gpx");
    assert.ok(parsed);
    assert.equal(parsed.discipline, "RUN");
    assert.deepEqual(parsed.streams.latlng?.data, [
      [37.77, -122.42],
      [37.771, -122.421],
      null,
      [37.773, -122.423],
    ]);
    assert.deepEqual(parsed.streams.time?.data, [0, 10, 20, 30]);
  });
});

describe("parseTcxFile", () => {
  it("reads trackpoint positions alongside other streams", () => {
    const parsed = parseTcxFile(TCX, "fallback.tcx");
    assert.ok(parsed);
    assert.equal(parsed.discipline, "BIKE");
    assert.equal(parsed.streams.latlng?.data?.length, 3);
    assert.deepEqual(parsed.streams.latlng?.data?.[0], [37.77, -122.42]);
    assert.equal(parsed.streams.latlng?.data?.[2], null);
    assert.ok(parsed.streams.heartrate?.data?.includes(140));
  });
});

describe("parseRecordStreamPoints GPS alignment", () => {
  it("keeps lat/lng on downsampled chart points", () => {
    const points = parseRecordStreamPoints(
      {
        time: { data: [0, 1, 2] },
        heartrate: { data: [140, 142, 144] },
        latlng: {
          data: [
            [37.7, -122.4],
            [37.701, -122.401],
            [37.702, -122.402],
          ],
        },
      },
      "METRIC",
      "RUN"
    );
    assert.ok(points);
    assert.equal(points.length, 3);
    assert.equal(points[0]?.lat, 37.7);
    assert.equal(points[2]?.lng, -122.402);
  });
});
