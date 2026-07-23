import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rollupSessions,
  sessionBudgetRollup,
  sessionPlannedZoneRollup,
  workoutZoneRollup,
} from "./rollup";
import { computeZoneAllocationMissing } from "./session-zone";

const tempoWorkout = {
  version: 2,
  nodes: [
    {
      kind: "step",
      intensity: "active",
      duration: { type: "time", value: 1800 },
      target: { signal: "power", mode: "zone", zone: 4 },
    },
  ],
};

describe("sessionPlannedZoneRollup", () => {
  it("prefers workout zones over conflicting budget", () => {
    const rollup = sessionPlannedZoneRollup("BIKE", {
      targetZones: { "2": 60 },
      structuredSteps: tempoWorkout,
    });
    assert.equal(rollup.zones["BIKE-4"], 30);
    assert.equal(rollup.zones["BIKE-2"], undefined);
  });

  it("falls back to budget when no structured steps", () => {
    const rollup = sessionPlannedZoneRollup("BIKE", {
      targetZones: { "2": 60 },
    });
    assert.equal(rollup.zones["BIKE-2"], 60);
  });
});

describe("sessionBudgetRollup", () => {
  it("uses targetZones only", () => {
    const budget = sessionBudgetRollup("BIKE", { "2": 60 });
    assert.equal(budget.zones["BIKE-2"], 60);
    assert.equal(budget.totalMinutes, 60);
    assert.equal(budget.zoneAllocationMissing, false);
  });

  it("flags missing zones when duration hint is set but budget is empty", () => {
    const budget = sessionBudgetRollup("RUN", {}, 45);
    assert.equal(budget.zoneAllocationMissing, true);
    assert.equal(budget.durationMinutes, 45);
  });
});

describe("workoutZoneRollup", () => {
  it("rolls structured workout steps independently of budget", () => {
    const workout = workoutZoneRollup("BIKE", tempoWorkout);
    assert.equal(workout.zones["BIKE-4"], 30);
  });

  it("maps absolute watt intervals into Z1–Z5 via FTP", () => {
    const wattIntervals = {
      version: 2,
      nodes: [
        {
          kind: "repeat",
          repeatCount: 4,
          children: [
            {
              kind: "step",
              intensity: "interval",
              duration: { type: "time", value: 300 },
              target: { signal: "power", mode: "value", value: 250 },
            },
            {
              kind: "step",
              intensity: "recovery",
              duration: { type: "time", value: 180 },
              target: { signal: "power", mode: "value", value: 150 },
            },
          ],
        },
      ],
    };
    const rollup = sessionPlannedZoneRollup("BIKE", {
      structuredSteps: wattIntervals,
      flattenOptions: {
        thresholdFtpWatts: 250,
        powerZoneBoundaries: [55, 75, 90, 105],
      },
    });
    // 4×5m @ 250W → Z4; 4×3m @ 150W recovery → Z2 (recovery still counts toward TiZ).
    assert.equal(rollup.zones["BIKE-4"], 20);
    assert.equal(rollup.zones["BIKE-2"], 12);
    assert.equal(rollup.zones["BIKE-7"], undefined);
  });

  it("folds explicit zone-6/7 interval minutes into zone-5 for Week TiZ", () => {
    const z6Workout = {
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "zone", zone: 6 },
        },
      ],
    };
    const rollup = workoutZoneRollup("BIKE", z6Workout, { zoneCount: 5 });
    assert.equal(rollup.zones["BIKE-5"], 5);
    assert.equal(rollup.zones["BIKE-6"], undefined);
  });

  it("folds high watts from 7-zone power profiles into Z5", () => {
    const vo2 = {
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "value", value: 350 },
        },
      ],
    };
    const rollup = sessionPlannedZoneRollup("BIKE", {
      structuredSteps: vo2,
      flattenOptions: {
        thresholdFtpWatts: 250,
        // Coggan-style 7-zone cutoffs
        powerZoneBoundaries: [55, 75, 90, 105, 120, 150],
        zoneCount: 5,
      },
    });
    assert.equal(rollup.zones["BIKE-5"], 5);
    assert.equal(rollup.zones["BIKE-6"], undefined);
  });
});

describe("rollupSessions", () => {
  it("sums targetZones across sessions", () => {
    const result = rollupSessions([
      { discipline: "BIKE", targetZones: { "2": 60 } },
      { discipline: "RUN", targetZones: { "3": 30 } },
    ]);
    assert.equal(result.zones["BIKE-2"], 60);
    assert.equal(result.zones["RUN-3"], 30);
    assert.equal(result.missingZoneCount, 0);
  });

  it("uses workout zones for sessions with structured steps", () => {
    const result = rollupSessions([
      {
        discipline: "BIKE",
        targetZones: { "2": 60 },
        structuredSteps: tempoWorkout,
      },
      { discipline: "RUN", targetZones: { "3": 30 } },
    ]);
    assert.equal(result.zones["BIKE-4"], 30);
    assert.equal(result.zones["BIKE-2"], undefined);
    assert.equal(result.zones["RUN-3"], 30);
  });
});

describe("computeZoneAllocationMissing", () => {
  it("is false when budget zones fill duration", () => {
    assert.equal(computeZoneAllocationMissing("BIKE", { "2": 60 }), false);
  });

  it("is true for duration-only session with empty zones", () => {
    assert.equal(computeZoneAllocationMissing("RUN", {}, 60), true);
  });

  it("uses workout zones when structured steps are present", () => {
    assert.equal(
      computeZoneAllocationMissing("BIKE", { "2": 60 }, undefined, tempoWorkout),
      false
    );
  });
});
