import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultVolumeSettingsForPhaseKind,
  defaultVolumeSettingsForPhaseName,
  inferPhaseKindFromVolumeSettings,
  resolvePhaseVolumeSettings,
  volumeMesocycleModeToDb,
  volumeTrendFromDb,
} from "./phase-volume-settings";

describe("phase-volume-settings", () => {
  it("seeds defaults by phase kind", () => {
    assert.equal(defaultVolumeSettingsForPhaseKind("BASE").volumeTrend, "INCREASE");
    assert.equal(defaultVolumeSettingsForPhaseKind("BUILD").volumeTrend, "HOLD");
    assert.equal(defaultVolumeSettingsForPhaseKind("RACE_PREP").volumeTargetPercent, 90);
    assert.equal(defaultVolumeSettingsForPhaseKind("TAPER").suppressRecovery, true);
  });

  it("infers kind from phase name", () => {
    assert.equal(defaultVolumeSettingsForPhaseName("Race prep").volumeTrend, "DECREASE");
    assert.equal(defaultVolumeSettingsForPhaseName("Taper").volumeTrend, "TAPER");
  });

  it("round-trips taper trend through db mode", () => {
    assert.equal(volumeMesocycleModeToDb("TAPER"), "HOLD");
    assert.equal(volumeTrendFromDb("HOLD", true), "TAPER");
    assert.equal(volumeTrendFromDb("INCREASE", false), "INCREASE");
  });

  it("resolves explicit overrides", () => {
    const resolved = resolvePhaseVolumeSettings({
      name: "Base",
      volumeTrend: "HOLD",
      volumeTargetPercent: 95,
      suppressRecovery: true,
    });
    assert.equal(resolved.volumeTrend, "HOLD");
    assert.equal(resolved.volumeTargetPercent, 95);
    assert.equal(resolved.suppressRecovery, true);
  });

  it("infers phase kind from resolved settings", () => {
    assert.equal(
      inferPhaseKindFromVolumeSettings(defaultVolumeSettingsForPhaseKind("TAPER")),
      "TAPER"
    );
    assert.equal(
      inferPhaseKindFromVolumeSettings(defaultVolumeSettingsForPhaseKind("RACE_PREP")),
      "RACE_PREP"
    );
  });
});
