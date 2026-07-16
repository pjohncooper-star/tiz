import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignEcoZone,
  ecoBoundariesForSignal,
} from "@/lib/eco/boundaries";
import { ecoZoneScore } from "@/lib/eco/scores";
import {
  ecoMinutesFromStructuredWorkout,
  resolveConcreteSample,
} from "@/lib/eco/structured-eco";
import {
  mapTizMinutesToEcoZones,
  projectedEcosFromPlannedTiZ,
} from "@/lib/eco/tiz-to-eco";

const WORKOUT_DOC = { version: 2 as const };

describe("resolveConcreteSample", () => {
  it("treats absolute watts as concrete", () => {
    const sample = resolveConcreteSample({
      signal: "power",
      mode: "value",
      value: 238,
    });
    assert.deepEqual(sample, { signal: "POWER", value: 238 });
  });

  it("rejects zone-looking power ranges", () => {
    assert.equal(
      resolveConcreteSample({
        signal: "power",
        mode: "range",
        low: 2,
        high: 3,
      }),
      null
    );
  });

  it("accepts absolute power ranges", () => {
    const sample = resolveConcreteSample({
      signal: "power",
      mode: "range",
      low: 200,
      high: 240,
    });
    assert.deepEqual(sample, { signal: "POWER", value: 220 });
  });
});

describe("ecoMinutesFromStructuredWorkout", () => {
  it("scores 60 min at ~0.95×FTP into assignEcoZone band", () => {
    const ftp = 250;
    const watts = Math.round(ftp * 0.95);
    const expectedZone = assignEcoZone(
      watts,
      ftp,
      ecoBoundariesForSignal("POWER"),
      "POWER"
    );

    const result = ecoMinutesFromStructuredWorkout({
      thresholds: { ftpWatts: ftp },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 3600 },
            target: { signal: "power", mode: "value", value: watts },
          },
        ],
      },
    });

    assert.ok(result);
    assert.equal(result!.scoredMinutes, 60);
    assert.equal(result!.ecoZoneMinutes[expectedZone], 60);
    for (let z = 1; z <= 8; z++) {
      if (z !== expectedZone) assert.equal(result!.ecoZoneMinutes[z] ?? 0, 0);
    }
    // Not the TiZ-table guess from bogus zone key (round(238) → Z5 split).
    const tableGuess = mapTizMinutesToEcoZones({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 60 });
    assert.notDeepEqual(result!.ecoZoneMinutes, tableGuess);
  });

  it("scores run pace via PACE boundaries", () => {
    const thresholdPace = 300; // sec/km
    const targetPace = 270; // faster → higher ECO zone
    const expectedZone = assignEcoZone(
      targetPace,
      thresholdPace,
      ecoBoundariesForSignal("PACE"),
      "PACE"
    );

    const result = ecoMinutesFromStructuredWorkout({
      thresholds: { thresholdPaceSeconds: thresholdPace },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 1800 },
            target: { signal: "pace", mode: "value", value: targetPace },
            targetPaceSeconds: targetPace,
          },
        ],
      },
    });

    assert.ok(result);
    assert.equal(result!.scoredMinutes, 30);
    assert.equal(result!.ecoZoneMinutes[expectedZone], 30);
  });

  it("falls back to TiZ table for zone-mode steps", () => {
    const result = ecoMinutesFromStructuredWorkout({
      thresholds: { ftpWatts: 250 },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 3600 },
            target: { signal: "power", mode: "zone", zone: 2 },
          },
        ],
      },
    });

    assert.ok(result);
    assert.deepEqual(result!.ecoZoneMinutes, mapTizMinutesToEcoZones({ 2: 60 }));
  });

  it("skips rest intensity", () => {
    const result = ecoMinutesFromStructuredWorkout({
      thresholds: { ftpWatts: 250 },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "rest",
            duration: { type: "time", value: 300 },
            target: { signal: "power", mode: "value", value: 100 },
          },
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 600 },
            target: { signal: "power", mode: "value", value: 238 },
          },
        ],
      },
    });
    assert.ok(result);
    assert.equal(result!.scoredMinutes, 10);
  });
});

describe("projectedEcosFromPlannedTiZ structured path", () => {
  it("uses assignEcoZone ECO for concrete watts + FTP", () => {
    const ftp = 250;
    const watts = Math.round(ftp * 0.95);
    const zone = assignEcoZone(
      watts,
      ftp,
      ecoBoundariesForSignal("POWER"),
      "POWER"
    );
    const projected = projectedEcosFromPlannedTiZ({
      discipline: "BIKE",
      thresholds: { ftpWatts: ftp },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 3600 },
            target: { signal: "power", mode: "value", value: watts },
          },
        ],
      },
    });
    assert.ok(projected);
    assert.equal(projected!.usedStructuredTargets, true);
    assert.equal(projected!.ecos, 60 * ecoZoneScore(zone) * 0.5);
  });

  it("skips structured assignEcoZone without usable thresholds", () => {
    const watts = 238;
    const withFtp = projectedEcosFromPlannedTiZ({
      discipline: "BIKE",
      thresholds: { ftpWatts: 250 },
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 3600 },
            target: { signal: "power", mode: "value", value: watts },
          },
        ],
      },
    });
    const without = projectedEcosFromPlannedTiZ({
      discipline: "BIKE",
      thresholds: null,
      structuredSteps: {
        ...WORKOUT_DOC,
        nodes: [
          {
            kind: "step",
            intensity: "active",
            duration: { type: "time", value: 3600 },
            target: { signal: "power", mode: "value", value: watts },
          },
        ],
      },
    });
    assert.ok(withFtp);
    assert.equal(withFtp!.usedStructuredTargets, true);
    // Rollup clamps watts→zone 7; TiZ Z1–5 map yields no ECO without thresholds.
    assert.equal(without, null);
  });

  it("keeps zone-budget sessions on the TiZ table", () => {
    const projected = projectedEcosFromPlannedTiZ({
      discipline: "RUN",
      targetZones: { "2": 45 },
    });
    assert.ok(projected);
    assert.equal(projected!.usedStructuredTargets, false);
    assert.equal(projected!.ecos, 45 * ecoZoneScore(3));
  });
});
