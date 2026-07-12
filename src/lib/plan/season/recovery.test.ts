import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyRecoveryVolumeHours,
  applyRecoveryZonesForDiscipline,
  suggestRecoveryWeeks,
} from "./recovery";
import { setZoneMinute } from "./simple-tiz";

describe("suggestRecoveryWeeks", () => {
  it("marks every fourth week for 3:1 cadence", () => {
    const flags = suggestRecoveryWeeks(8, 3);
    assert.deepEqual(flags, [false, false, false, true, false, false, false, true]);
  });

  it("skips excluded week indices", () => {
    const flags = suggestRecoveryWeeks(5, 3, new Set([3]));
    assert.equal(flags[3], false);
  });
});

describe("applyRecoveryVolumeHours", () => {
  it("scales hours by recovery volume percent", () => {
    const result = applyRecoveryVolumeHours(
      { swimHours: 3, bikeHours: 6, runHours: 3 },
      60
    );
    assert.equal(result.swimHours, 1.8);
    assert.equal(result.bikeHours, 3.6);
    assert.equal(result.runHours, 1.8);
    assert.equal(result.totalHours, 7.2);
  });
});

describe("applyRecoveryZonesForDiscipline", () => {
  const baseline = ["SWIM", "BIKE", "RUN"].reduce(
    (zones, discipline) => {
      let next = zones;
      for (const zone of [1, 2, 3, 4, 5]) {
        next = setZoneMinute(next, discipline as "SWIM", zone, zone * 10);
      }
      return next;
    },
    {} as ReturnType<typeof setZoneMinute>
  );

  it("scales all zones proportionally by default", () => {
    const result = applyRecoveryZonesForDiscipline(baseline, "SWIM", 90, {
      volumePercent: 60,
      loadWeeks: 3,
      zoneMode: "proportional",
      highZoneCutPercent: 50,
    });
    assert.equal(result["SWIM-1"], 6);
    assert.equal(result["SWIM-5"], 30);
    const total = [1, 2, 3, 4, 5].reduce(
      (sum, zone) => sum + (result[`SWIM-${zone}`] ?? 0),
      0
    );
    assert.equal(total, 90);
  });

  it("cuts high zones and boosts low zones in intensity shift mode", () => {
    let swimBaseline = {};
    for (const zone of [1, 2, 3, 4, 5]) {
      swimBaseline = setZoneMinute(swimBaseline, "SWIM", zone, 20);
    }
    const result = applyRecoveryZonesForDiscipline(swimBaseline, "SWIM", 100, {
      volumePercent: 60,
      loadWeeks: 3,
      zoneMode: "intensity_shift",
      highZoneCutPercent: 50,
    });
    assert.equal(result["SWIM-3"], 10);
    assert.equal(result["SWIM-4"], 10);
    assert.equal(result["SWIM-5"], 10);
    assert.ok((result["SWIM-1"] ?? 0) > 20);
    assert.ok((result["SWIM-2"] ?? 0) > 20);
    const total = [1, 2, 3, 4, 5].reduce(
      (sum, zone) => sum + (result[`SWIM-${zone}`] ?? 0),
      0
    );
    assert.equal(total, 100);
  });
});
