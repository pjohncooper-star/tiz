import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyPhase,
  createPhaseAtWeek,
} from "@/components/simple-planner/simple-planner-types";
import {
  phaseCanGenerateSessions,
  phaseGenerateBlockers,
} from "./phase-generate-blockers";

describe("phaseGenerateBlockers", () => {
  it("lists unassigned weeks and a missing weekly template", () => {
    const phase = createEmptyPhase(1);
    assert.deepEqual(phaseGenerateBlockers(phase), [
      "Assign this phase to weeks",
      "Choose a weekly template",
    ]);
    assert.equal(phaseCanGenerateSessions(phase), false);
  });

  it("lists only the missing template once the phase covers weeks", () => {
    const phase = createPhaseAtWeek(0, 1);
    assert.deepEqual(phaseGenerateBlockers(phase), ["Choose a weekly template"]);
  });

  it("is empty when the phase is assigned and has a weekly template", () => {
    const phase = { ...createPhaseAtWeek(2, 1), weeklyTemplateId: "tmpl_1" };
    assert.deepEqual(phaseGenerateBlockers(phase), []);
    assert.equal(phaseCanGenerateSessions(phase), true);
  });
});
