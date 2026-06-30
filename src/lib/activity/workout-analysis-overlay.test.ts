import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkoutAnalysisOverlay,
  distanceAtTime,
} from "./workout-analysis-overlay";
import type { ActivityStreamPoint } from "./record-streams";

const openTarget = { signal: "power" as const, mode: "zone" as const, zone: 2 };

const tempoRepeatWorkout = {
  version: 2,
  nodes: [
    {
      kind: "step",
      intensity: "warmup",
      duration: { type: "time", value: 540 },
      target: openTarget,
    },
    {
      kind: "repeat",
      repeatCount: 4,
      children: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 360 },
          target: { signal: "power", mode: "zone", zone: 4 },
        },
        {
          kind: "step",
          intensity: "recovery",
          duration: { type: "time", value: 120 },
          target: openTarget,
        },
      ],
    },
  ],
};

const garminTempoLaps = [0, 2, 3, 2, 3, 2, 3, 2, 3, 3].map((wktStepIndex, i) => {
  const elapsed = [549, 360, 120, 360, 120, 360, 120, 42, 149, 149][i];
  return { wktStepIndex, elapsedSeconds: elapsed };
});

function linearStream(totalSec: number, metersPerSec: number): ActivityStreamPoint[] {
  const points: ActivityStreamPoint[] = [];
  for (let t = 0; t <= totalSec; t += 60) {
    points.push({
      timeSec: t,
      distanceM: t * metersPerSec,
      power: 200,
      cadence: 90,
      speed: 30,
      pace: null,
      heartRate: 140,
    });
  }
  return points;
}

describe("distanceAtTime", () => {
  it("interpolates distance between stream samples", () => {
    const points = linearStream(600, 5);
    assert.equal(distanceAtTime(points, 0), 0);
    assert.equal(distanceAtTime(points, 300), 1500);
    assert.equal(distanceAtTime(points, 330), 1650);
  });
});

describe("buildWorkoutAnalysisOverlay", () => {
  it("builds cumulative lap regions for tempo fixture", () => {
    const stream = linearStream(2400, 5);
    const overlay = buildWorkoutAnalysisOverlay({
      structuredSteps: tempoRepeatWorkout,
      workoutLaps: garminTempoLaps,
      discipline: "BIKE",
      displayUnit: "METRIC",
      primarySignal: "POWER",
      thresholds: { thresholdFtpWatts: 250 },
      streamPoints: stream,
    });
    assert.ok(overlay);
    assert.equal(overlay.lapRegions.length, 10);
    assert.equal(overlay.stepRegions.length, 9);
    assert.equal(overlay.lapRegions[0].startSec, 0);
    assert.equal(overlay.lapRegions[0].endSec, 549);
    assert.equal(overlay.lapRegions[9].startSec, 2180);
    assert.equal(overlay.lapRegions[9].endSec, 2329);
  });

  it("uses actual lap width for open-duration steps", () => {
    const openWarmupWorkout = {
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "warmup",
          duration: { type: "open", estimateSeconds: 540 },
          target: openTarget,
        },
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 600 },
          target: openTarget,
        },
      ],
    };
    const laps = [
      { wktStepIndex: 0, elapsedSeconds: 620 },
      { wktStepIndex: 1, elapsedSeconds: 590 },
    ];
    const stream = linearStream(1300, 4);
    const overlay = buildWorkoutAnalysisOverlay({
      structuredSteps: openWarmupWorkout,
      workoutLaps: laps,
      discipline: "BIKE",
      displayUnit: "METRIC",
      primarySignal: "POWER",
      thresholds: { thresholdFtpWatts: 250 },
      streamPoints: stream,
    });
    assert.ok(overlay);
    assert.equal(overlay.stepRegions.length, 2);
    assert.equal(overlay.stepRegions[0].openDuration, true);
    assert.equal(
      overlay.stepRegions[0].endTimeSec - overlay.stepRegions[0].startTimeSec,
      620
    );
    assert.equal(
      overlay.stepRegions[1].endTimeSec - overlay.stepRegions[1].startTimeSec,
      600
    );
  });

  it("emits stepped ghost points per execution step", () => {
    const stream = linearStream(2400, 5);
    const overlay = buildWorkoutAnalysisOverlay({
      structuredSteps: tempoRepeatWorkout,
      workoutLaps: garminTempoLaps,
      discipline: "BIKE",
      displayUnit: "METRIC",
      primarySignal: "POWER",
      thresholds: { thresholdFtpWatts: 250 },
      streamPoints: stream,
    });
    assert.ok(overlay);
    assert.equal(overlay.ghostPoints.length, 18);
    assert.equal(overlay.ghostYAxisId, "power");
  });
});
