import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFitStepNotes } from "@/lib/workout/fit-step-notes";
import { seedSwimEquipmentCatalog } from "@/lib/swim/equipment-catalog";

describe("formatFitStepNotes", () => {
  it("returns undefined when there is nothing to say", () => {
    assert.equal(formatFitStepNotes({}), undefined);
  });

  it("keeps plain notes", () => {
    assert.equal(formatFitStepNotes({ notes: " easy " }), "easy");
  });

  it("appends equipment labels after notes", () => {
    assert.equal(
      formatFitStepNotes(
        { notes: "kick focus", equipment: ["kickboard", "fins"] },
        { swimEquipmentCatalog: seedSwimEquipmentCatalog() }
      ),
      "kick focus · Equipment: Kickboard, Fins"
    );
  });

  it("emits equipment alone when notes are empty", () => {
    assert.equal(
      formatFitStepNotes({ equipment: ["snorkel"] }),
      "Equipment: Snorkel"
    );
  });
});
