import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";

const PARSED_DEFAULTS = {
  strengthSessionsPerWeek: 2,
  swimIntenseDaysPerWeek: 1,
  bikeIntenseDaysPerWeek: 1,
  runIntenseDaysPerWeek: 1,
  volumeTrend: null,
  isTaperVolume: false,
  volumeTargetPercent: null,
  volumeTaperStartPercent: null,
  volumeTaperEndPercent: null,
  longSessionCadence: null,
  suppressRecovery: null,
} as const;

describe("simple-phase-notes", () => {
  it("reads plain-text coach notes as goal with defaults", () => {
    assert.deepEqual(parsePhaseCoachNotes("Aerobic base"), {
      goal: "Aerobic base",
      ...PARSED_DEFAULTS,
    });
  });

  it("round-trips strength and intense days in JSON coach notes", () => {
    const serialized = serializePhaseCoachNotes({
      goal: "Build",
      strengthSessionsPerWeek: 3,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 2,
      runIntenseDaysPerWeek: 1,
      ...PARSED_DEFAULTS,
    });
    assert.deepEqual(parsePhaseCoachNotes(serialized), {
      goal: "Build",
      strengthSessionsPerWeek: 3,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 2,
      runIntenseDaysPerWeek: 1,
      ...PARSED_DEFAULTS,
    });
  });

  it("keeps plain-text goals when everything is default", () => {
    assert.equal(
      serializePhaseCoachNotes({
        goal: "Taper focus",
        ...PARSED_DEFAULTS,
      }),
      "Taper focus"
    );
  });

  it("still reads legacy strength-only JSON payloads", () => {
    const legacy = JSON.stringify({ goal: "Build", strengthSessionsPerWeek: 3 });
    assert.deepEqual(parsePhaseCoachNotes(legacy), {
      goal: "Build",
      ...PARSED_DEFAULTS,
      strengthSessionsPerWeek: 3,
    });
  });

  it("round-trips volume settings", () => {
    const serialized = serializePhaseCoachNotes({
      goal: null,
      strengthSessionsPerWeek: 2,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 1,
      runIntenseDaysPerWeek: 1,
      volumeTrend: "TAPER",
      isTaperVolume: true,
      volumeTargetPercent: 45,
      volumeTaperStartPercent: 70,
      volumeTaperEndPercent: 45,
      longSessionCadence: "NONE",
      suppressRecovery: true,
    });
    const parsed = parsePhaseCoachNotes(serialized);
    assert.equal(parsed.volumeTrend, "TAPER");
    assert.equal(parsed.suppressRecovery, true);
    assert.equal(parsed.longSessionCadence, "NONE");
  });
});
