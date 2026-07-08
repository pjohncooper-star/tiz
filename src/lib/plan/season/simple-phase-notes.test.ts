import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";

describe("simple-phase-notes", () => {
  it("reads plain-text coach notes as goal with default strength", () => {
    assert.deepEqual(parsePhaseCoachNotes("Aerobic base"), {
      goal: "Aerobic base",
      strengthSessionsPerWeek: 2,
    });
  });

  it("round-trips strength in JSON coach notes", () => {
    const serialized = serializePhaseCoachNotes("Build", 3);
    assert.equal(serialized, JSON.stringify({ goal: "Build", strengthSessionsPerWeek: 3 }));
    assert.deepEqual(parsePhaseCoachNotes(serialized), {
      goal: "Build",
      strengthSessionsPerWeek: 3,
    });
  });

  it("keeps plain-text goals when strength is default", () => {
    assert.equal(serializePhaseCoachNotes("Taper focus", 2), "Taper focus");
  });
});
