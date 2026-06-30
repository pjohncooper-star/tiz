import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import { FOCUS_TIZ_PRESETS } from "./constants";
import {
  aggregateZoneMinutesAcrossDisciplines,
  computeZoneMinutesForWeek,
  focusPercents,
} from "./focus-tiz";

const basePhase = {
  name: "Base",
  sortOrder: 0,
  weekCount: 4,
  phaseKind: "BASE" as const,
  focusMode: "PHASE" as const,
  phaseFocus: "MAINTENANCE" as const,
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

describe("focus-tiz", () => {
  it("exposes maintenance preset matching coaching defaults", () => {
    assert.deepEqual(FOCUS_TIZ_PRESETS.MAINTENANCE, {
      z1: 70,
      z2: 22,
      z3: 6,
      z4: 1,
      z5: 1,
    });
  });

  it("allocates zone minutes using zoneKey format", () => {
    const zones = computeZoneMinutesForWeek({
      phase: basePhase,
      swimHours: 2,
      bikeHours: 5,
      runHours: 3,
      deLoadStrategy: "VOLUME_ONLY",
      isDeLoadWeek: false,
    });
    assert.ok(zones[zoneKey("BIKE", 1)]! > 0);
    assert.ok(zones[zoneKey("SWIM", 2)]! > 0);
    assert.ok(zones[zoneKey("RUN", 3)]! > 0);
    const total = aggregateZoneMinutesAcrossDisciplines(zones);
    assert.equal(Math.round(total.reduce((a, b) => a + b, 0)), 10 * 60);
  });

  it("shifts intensity down on de-load with volume_and_intensity strategy", () => {
    const build = computeZoneMinutesForWeek({
      phase: { ...basePhase, phaseFocus: "VO2_MAX" },
      swimHours: 1,
      bikeHours: 1,
      runHours: 1,
      deLoadStrategy: "VOLUME_ONLY",
      isDeLoadWeek: false,
    });
    const deLoad = computeZoneMinutesForWeek({
      phase: { ...basePhase, phaseFocus: "VO2_MAX" },
      swimHours: 1,
      bikeHours: 1,
      runHours: 1,
      deLoadStrategy: "VOLUME_AND_INTENSITY",
      isDeLoadWeek: true,
    });
    const buildZ5 =
      (build[zoneKey("BIKE", 5)] ?? 0) + (build[zoneKey("RUN", 5)] ?? 0);
    const deLoadZ5 =
      (deLoad[zoneKey("BIKE", 5)] ?? 0) + (deLoad[zoneKey("RUN", 5)] ?? 0);
    assert.ok(deLoadZ5 < buildZ5);
  });

  it("uses per-discipline focus when focusMode is DISCIPLINE", () => {
    const percents = focusPercents("THRESHOLD");
    assert.equal(percents.z3, FOCUS_TIZ_PRESETS.THRESHOLD.z3);

    const zones = computeZoneMinutesForWeek({
      phase: {
        ...basePhase,
        focusMode: "DISCIPLINE",
        phaseFocus: null,
        disciplineFocuses: [
          { discipline: "BIKE", focus: "THRESHOLD" },
          { discipline: "RUN", focus: "AEROBIC_BASE" },
          { discipline: "SWIM", focus: "MAINTENANCE" },
        ],
      },
      swimHours: 1,
      bikeHours: 2,
      runHours: 1,
      deLoadStrategy: "VOLUME_ONLY",
      isDeLoadWeek: false,
    });
    assert.ok(zones[zoneKey("BIKE", 3)]! > zones[zoneKey("RUN", 3)]!);
  });
});
