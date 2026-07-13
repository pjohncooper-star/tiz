import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ThresholdProfile } from "@prisma/client";
import { buildPoolSwimLapPaceStreams } from "@/lib/import/swim-laps";
import { computeZoneBreakdown } from "@/lib/zones/compute";
import {
  REST_PACE_OFFSET_SEC,
  restChartPaceSec,
} from "@/lib/zones/swim-rest";

const swimPaceProfile = {
  signalType: "PACE",
  thresholdValue: 120,
  zoneBoundaries: [93.5, 98, 102, 106.4],
  zoneCount: 5,
} as ThresholdProfile;

describe("restChartPaceSec", () => {
  it("returns slowest active pace plus offset", () => {
    assert.equal(restChartPaceSec(90), 90 + REST_PACE_OFFSET_SEC);
  });

  it("returns default when no active laps", () => {
    assert.equal(restChartPaceSec(0), 120);
  });

  it("places rest slower than slowest interval", () => {
    const slowest = 105;
    assert.ok(restChartPaceSec(slowest) > slowest);
  });
});

describe("computeZoneBreakdown swim rest", () => {
  it("credits rest lap duration to zone 1", () => {
    const swimLaps = {
      data: [
        { startSec: 0, durationSec: 60, speedMps: 1.5 },
        { startSec: 60, durationSec: 30, speedMps: 0 },
        { startSec: 90, durationSec: 60, speedMps: 1.0 },
        { startSec: 150, durationSec: 60, speedMps: 0.8 },
      ],
    };
    const lapPace = buildPoolSwimLapPaceStreams(swimLaps.data);
    assert.ok(lapPace);

    const zones = computeZoneBreakdown(
      {
        swimLaps,
        velocity: lapPace.velocity,
        velocityTime: lapPace.velocityTime,
      },
      swimPaceProfile,
      "SWIM",
      210
    );

    assert.equal(zones[1], 0.5);
    assert.ok((zones[5] ?? 0) > 0);
  });

  it("does not add rest minutes for non-swim disciplines", () => {
    const swimLaps = {
      data: [{ startSec: 0, durationSec: 30, speedMps: 0 }],
    };

    const zones = computeZoneBreakdown(
      { swimLaps, velocity: { data: [3.5, 3.5] }, time: { data: [0, 60] } },
      {
        ...swimPaceProfile,
        signalType: "PACE",
        thresholdValue: 300,
      } as ThresholdProfile,
      "RUN",
      60
    );

    assert.equal(zones[1], 0);
  });
});
