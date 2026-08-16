import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlannedSessionStats,
  completedComparisonDuration,
} from "@/lib/plan/session-stats";

/** Absolute-watt sweet-spot intervals must use athlete FTP, not FALLBACK_FTP (200). */
const sweetSpot3x8 = {
  version: 2,
  nodes: [
    {
      kind: "step",
      intensity: "warmup",
      duration: { type: "time", value: 300 },
      target: { signal: "power", mode: "range", low: 126, high: 154 },
    },
    {
      kind: "repeat",
      repeatCount: 3,
      children: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 480 },
          target: { signal: "power", mode: "range", low: 240, high: 280 },
        },
        {
          kind: "step",
          intensity: "recovery",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "range", low: 160, high: 200 },
        },
      ],
    },
    {
      kind: "step",
      intensity: "cooldown",
      duration: { type: "time", value: 300 },
      target: { signal: "power", mode: "range", low: 126, high: 154 },
    },
  ],
};

describe("buildPlannedSessionStats bike power TiZ", () => {
  it("maps sweet-spot watts via athlete FTP instead of fallback 200W", () => {
    const withFtp = buildPlannedSessionStats("BIKE", "METRIC", {
      distanceMeters: null,
      targetSpeedMps: null,
      targetPaceSeconds: null,
    }, {
      structuredSteps: sweetSpot3x8,
      thresholdFtpWatts: 250,
      powerZoneBoundaries: [55, 75, 90, 105],
    });
    // Midpoint 260W / 250 FTP = 104% → Z4; 3×8m = 24m in Z4 (not Z5).
    assert.equal(withFtp.zoneMinutes["BIKE-4"], 24);
    assert.equal(withFtp.zoneMinutes["BIKE-5"], undefined);

    const withoutFtp = buildPlannedSessionStats("BIKE", "METRIC", {
      distanceMeters: null,
      targetSpeedMps: null,
      targetPaceSeconds: null,
    }, {
      structuredSteps: sweetSpot3x8,
    });
    // Without FTP, FALLBACK_FTP 200 maps 260W → Z5.
    assert.equal(withoutFtp.zoneMinutes["BIKE-5"], 24);
    assert.equal(withoutFtp.zoneMinutes["BIKE-4"], undefined);
  });
});

describe("completedComparisonDuration", () => {
  it("formats canonical duration as H:MM:SS", () => {
    const value = completedComparisonDuration(
      {
        stats: [{ label: "Duration", value: "45:30" }],
        zoneMinutes: {},
        activities: [],
        canonical: { durationMinutes: 45.5, distanceMeters: null, targetSpeedMps: null, targetPaceSeconds: null },
      },
      "RUN"
    );
    assert.equal(value, "0:45:30");
  });

  it("reformats stat duration when canonical is absent", () => {
    const value = completedComparisonDuration(
      {
        stats: [{ label: "Moving", value: "1:02:15" }],
        zoneMinutes: {},
        activities: [],
      },
      "BIKE"
    );
    assert.equal(value, "1:02:15");
  });

  it("uses elapsed for swim", () => {
    const value = completedComparisonDuration(
      {
        stats: [
          { label: "Elapsed", value: "32:10" },
          { label: "Moving", value: "28:00" },
        ],
        zoneMinutes: {},
        activities: [],
        canonical: { durationMinutes: 32 + 10 / 60, distanceMeters: 2000, targetSpeedMps: null, targetPaceSeconds: 96 },
      },
      "SWIM"
    );
    assert.equal(value, "0:32:10");
  });
});
