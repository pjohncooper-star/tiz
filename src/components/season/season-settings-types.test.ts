import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sectionSlugToStep,
  sectionTitleForStep,
  normalizeSettingsSectionSlug,
} from "@/components/season/season-settings-types";

describe("season settings sections v2", () => {
  it("maps v2 slugs to steps 0–4", () => {
    assert.equal(sectionSlugToStep("dates"), 0);
    assert.equal(sectionSlugToStep("cycle"), 1);
    assert.equal(sectionSlugToStep("goals"), 2);
    assert.equal(sectionSlugToStep("workouts"), 3);
    assert.equal(sectionSlugToStep("volume"), 4);
  });

  it("redirects legacy slugs", () => {
    assert.equal(normalizeSettingsSectionSlug("deload"), "volume");
    assert.equal(normalizeSettingsSectionSlug("focus"), "goals");
    assert.equal(sectionSlugToStep("deload"), 4);
    assert.equal(sectionSlugToStep("focus"), 2);
  });

  it("returns step titles", () => {
    assert.equal(sectionTitleForStep(2), "Goals & training days");
    assert.equal(sectionTitleForStep(4), "Volume, ramp & de-load");
  });
});
