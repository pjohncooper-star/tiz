import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { zoneKey } from "@/lib/workout/steps";
import {
  clampZoneMinutesToVolume,
  defaultZoneRampDefaults,
  parseDisciplineZoneMinutes,
  recalculateSimpleZoneMinutes,
  zoneMinutesBudget,
  zoneMinutesExceedsVolume,
} from "./simple-tiz";

describe("simple-tiz", () => {
  it("parses discipline-prefixed zone minute keys", () => {
    const parsed = parseDisciplineZoneMinutes({
      "RUN-4": 40,
      "SWIM-2": 20,
      "4": 99,
      "invalid": 10,
    });
    assert.equal(parsed[zoneKey("RUN", 4)], 40);
    assert.equal(parsed[zoneKey("SWIM", 2)], 20);
    assert.equal(parsed["4"], undefined);
  });

  it("ramps zone minutes week over week", () => {
    const zoneDefaults = defaultZoneRampDefaults();
    zoneDefaults.RUN.z2 = { startMinutes: 30, peakMinutes: 90, ratePercent: 10 };

    const weeks = [
      {
        weekIndex: 0,
        isRestWeek: false,
        swimHours: 2,
        bikeHours: 4,
        runHours: 3,
        zoneMinutes: {},
      },
      {
        weekIndex: 1,
        isRestWeek: false,
        swimHours: 2,
        bikeHours: 4,
        runHours: 3,
        zoneMinutes: {},
      },
    ];

    const result = recalculateSimpleZoneMinutes(weeks, [], zoneDefaults);
    assert.equal(result[0]!.zoneMinutes[zoneKey("RUN", 2)], 30);
    assert.equal(result[1]!.zoneMinutes[zoneKey("RUN", 2)], 33);
  });

  it("preserves overridden weeks on recalculate", () => {
    const zoneDefaults = defaultZoneRampDefaults();
    zoneDefaults.RUN.z2 = { startMinutes: 30, peakMinutes: 90, ratePercent: 10 };

    const weeks = [
      {
        weekIndex: 0,
        isRestWeek: false,
        swimHours: 2,
        bikeHours: 4,
        runHours: 3,
        zoneMinutes: { [zoneKey("RUN", 2)]: 30 },
      },
      {
        weekIndex: 1,
        isRestWeek: false,
        swimHours: 2,
        bikeHours: 4,
        runHours: 3,
        zoneMinutes: { [zoneKey("RUN", 2)]: 50 },
        zoneMinutesOverridden: true,
      },
    ];

    const result = recalculateSimpleZoneMinutes(weeks, [], zoneDefaults);
    assert.equal(result[1]!.zoneMinutes[zoneKey("RUN", 2)], 50);
  });

  it("clamps zone minutes to discipline volume cap", () => {
    const week = {
      weekIndex: 0,
      isRestWeek: false,
      swimHours: 1,
      bikeHours: 1,
      runHours: 1,
      zoneMinutes: {
        [zoneKey("RUN", 1)]: 40,
        [zoneKey("RUN", 2)]: 30,
      },
    };

    const clamped = clampZoneMinutesToVolume(week);
    assert.equal(zoneMinutesBudget({ ...week, zoneMinutes: clamped }, "RUN", clamped).used, 60);
  });

  it("allows zone minutes below volume cap", () => {
    const week = {
      weekIndex: 0,
      isRestWeek: false,
      swimHours: 1,
      bikeHours: 1,
      runHours: 2,
      zoneMinutes: { [zoneKey("RUN", 2)]: 45 },
    };
    assert.equal(zoneMinutesExceedsVolume(week, "RUN", week.zoneMinutes), false);
    const { used, cap } = zoneMinutesBudget(week, "RUN", week.zoneMinutes);
    assert.equal(used, 45);
    assert.equal(cap, 120);
  });
});
