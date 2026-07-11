import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";

const defaults = {
  zoneSplits: null,
  strengthSessionsPerWeek: 2,
  swimIntenseDaysPerWeek: 1,
  bikeIntenseDaysPerWeek: 1,
  runIntenseDaysPerWeek: 1,
};

describe("simple-phase-notes", () => {
  it("reads plain-text coach notes as goal with defaults", () => {
    assert.deepEqual(parsePhaseCoachNotes("Aerobic base"), {
      goal: "Aerobic base",
      ...defaults,
    });
  });

  it("round-trips strength and intense days in JSON coach notes", () => {
    const serialized = serializePhaseCoachNotes({
      goal: "Build",
      zoneSplits: null,
      strengthSessionsPerWeek: 3,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 2,
      runIntenseDaysPerWeek: 1,
    });
    assert.deepEqual(parsePhaseCoachNotes(serialized), {
      goal: "Build",
      zoneSplits: null,
      strengthSessionsPerWeek: 3,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 2,
      runIntenseDaysPerWeek: 1,
    });
  });

  it("keeps plain-text goals when everything is default", () => {
    assert.equal(
      serializePhaseCoachNotes({
        goal: "Taper focus",
        zoneSplits: null,
        strengthSessionsPerWeek: 2,
        swimIntenseDaysPerWeek: 1,
        bikeIntenseDaysPerWeek: 1,
        runIntenseDaysPerWeek: 1,
      }),
      "Taper focus"
    );
  });

  it("still reads legacy strength-only JSON payloads", () => {
    const legacy = JSON.stringify({ goal: "Build", strengthSessionsPerWeek: 3 });
    assert.deepEqual(parsePhaseCoachNotes(legacy), {
      goal: "Build",
      ...defaults,
      strengthSessionsPerWeek: 3,
    });
  });
});
