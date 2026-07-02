import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSurveyUpdateFromValues,
  getDefaultSelfEvalConfig,
  getSurveyFieldValue,
  parseSelfEvalConfig,
  validateFieldValue,
  validateSelfEvalConfig,
} from "@/lib/survey/self-eval-config";

describe("self-eval-config", () => {
  it("returns default config with required builtins", () => {
    const config = getDefaultSelfEvalConfig();
    assert.equal(config.fields.length, 2);
    assert.equal(config.fields[0]?.id, "freshness");
    assert.equal(config.fields[0]?.kind, "feel");
    assert.equal(config.fields[1]?.id, "rpe");
    assert.equal(config.fields[1]?.kind, "rpe");
  });

  it("parses null as default config", () => {
    const config = parseSelfEvalConfig(null);
    assert.deepEqual(config, getDefaultSelfEvalConfig());
  });

  it("validates optional presets up to max fields", () => {
    const config = validateSelfEvalConfig({
      fields: [
        { id: "freshness", label: "How it felt", kind: "feel" },
        { id: "rpe", label: "Perceived effort", kind: "rpe" },
        { id: "sleep", label: "Sleep quality", kind: "scale", min: 1, max: 5 },
        { id: "note", label: "Notes", kind: "text" },
      ],
    });
    assert.equal(config.fields.length, 4);
    assert.equal(config.fields[2]?.id, "sleep");
  });

  it("rejects configs without required builtins", () => {
    assert.throws(() =>
      validateSelfEvalConfig({
        fields: [{ id: "sleep", label: "Sleep", kind: "scale", min: 1, max: 5 }],
      })
    );
  });

  it("rejects more than six fields", () => {
    assert.throws(() =>
      validateSelfEvalConfig({
        fields: [
          { id: "freshness", label: "How it felt", kind: "feel" },
          { id: "rpe", label: "Perceived effort", kind: "rpe" },
          { id: "sleep", label: "Sleep quality", kind: "scale", min: 1, max: 5 },
          { id: "motivation", label: "Motivation", kind: "scale", min: 1, max: 5 },
          { id: "soreness", label: "Soreness", kind: "scale", min: 1, max: 5 },
          { id: "note", label: "Notes", kind: "text" },
          { id: "custom1", label: "Custom", kind: "scale", min: 1, max: 5 },
        ],
      })
    );
  });

  it("reads column and custom field values from survey", () => {
    const survey = {
      rpe: 7,
      freshness: 50,
      sleep: 4,
      motivation: null,
      soreness: null,
      note: "Felt good",
      customFields: { custom1: 8 },
    };
    assert.equal(getSurveyFieldValue(survey, "freshness"), 50);
    assert.equal(getSurveyFieldValue(survey, "rpe"), 7);
    assert.equal(getSurveyFieldValue(survey, "sleep"), 4);
    assert.equal(getSurveyFieldValue(survey, "note"), "Felt good");
    assert.equal(getSurveyFieldValue(survey, "custom1"), 8);
  });

  it("builds survey update from values", () => {
    const config = validateSelfEvalConfig({
      fields: [
        { id: "freshness", label: "How it felt", kind: "feel" },
        { id: "rpe", label: "Perceived effort", kind: "rpe" },
        { id: "sleep", label: "Sleep quality", kind: "scale", min: 1, max: 5 },
        { id: "custom1", label: "Energy", kind: "scale", min: 1, max: 10 },
      ],
    });

    const update = buildSurveyUpdateFromValues(
      {
        freshness: 75,
        rpe: 6,
        sleep: 3,
        custom1: 9,
      },
      config
    );

    assert.equal(update.freshness, 75);
    assert.equal(update.rpe, 6);
    assert.equal(update.sleep, 3);
    assert.deepEqual(update.customFields, { custom1: 9 });
  });

  it("validates feel buckets and rpe range", () => {
    const feelField = { id: "freshness", label: "How it felt", kind: "feel" as const };
    const rpeField = { id: "rpe", label: "Perceived effort", kind: "rpe" as const };

    assert.equal(validateFieldValue(feelField, 25), 25);
    assert.throws(() => validateFieldValue(feelField, 30));
    assert.equal(validateFieldValue(rpeField, 10), 10);
    assert.throws(() => validateFieldValue(rpeField, 11));
  });
});
