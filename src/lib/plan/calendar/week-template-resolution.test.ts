import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveWeekTemplateKind,
  parseTestWeekFlags,
  resolveTestWeekFlagsForSeason,
  isTestWeekAtIndex,
  initialTestWeekFlags,
  type WeekTemplateResolutionInput,
} from "./week-template-resolution";

const base: WeekTemplateResolutionInput = {
  isTestWeek: false,
  isDeLoadWeek: false,
  hasPhaseTemplate: false,
  hasRestTemplate: false,
  hasTestTemplate: false,
};

test("normal week uses the phase template when defined", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({ ...base, hasPhaseTemplate: true }),
    { kind: "PHASE", suppressTiz: false, deLoadScaled: false }
  );
});

test("normal week with no phase template stays empty (NONE)", () => {
  assert.deepEqual(resolveWeekTemplateKind(base), {
    kind: "NONE",
    suppressTiz: false,
    deLoadScaled: false,
  });
});

test("de-load week prefers the rest template", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({
      ...base,
      isDeLoadWeek: true,
      hasRestTemplate: true,
      hasPhaseTemplate: true,
    }),
    { kind: "REST", suppressTiz: false, deLoadScaled: true }
  );
});

test("de-load week falls back to the phase template when no rest template", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({
      ...base,
      isDeLoadWeek: true,
      hasPhaseTemplate: true,
    }),
    { kind: "PHASE", suppressTiz: false, deLoadScaled: true }
  );
});

test("de-load week with neither template stays empty but keeps de-load scaling", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({ ...base, isDeLoadWeek: true }),
    { kind: "NONE", suppressTiz: false, deLoadScaled: true }
  );
});

test("test week uses the test template and suppresses TiZ", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({
      ...base,
      isTestWeek: true,
      hasTestTemplate: true,
    }),
    { kind: "TEST", suppressTiz: true, deLoadScaled: false }
  );
});

test("test week suppresses TiZ even with no test template", () => {
  assert.deepEqual(
    resolveWeekTemplateKind({ ...base, isTestWeek: true }),
    { kind: "NONE", suppressTiz: true, deLoadScaled: false }
  );
});

test("test week wins over de-load when both flagged", () => {
  const res = resolveWeekTemplateKind({
    ...base,
    isTestWeek: true,
    isDeLoadWeek: true,
    hasTestTemplate: true,
    hasRestTemplate: true,
    hasPhaseTemplate: true,
  });
  assert.equal(res.kind, "TEST");
  assert.equal(res.suppressTiz, true);
  assert.equal(res.deLoadScaled, false);
});

test("parseTestWeekFlags accepts boolean arrays, rejects others", () => {
  assert.deepEqual(parseTestWeekFlags([true, false, true]), [true, false, true]);
  assert.equal(parseTestWeekFlags(null), null);
  assert.equal(parseTestWeekFlags([1, 0]), null);
  assert.equal(parseTestWeekFlags("nope"), null);
});

test("initialTestWeekFlags is all-off and clamps negatives", () => {
  assert.deepEqual(initialTestWeekFlags(3), [false, false, false]);
  assert.deepEqual(initialTestWeekFlags(-2), []);
});

test("resolveTestWeekFlagsForSeason pads and truncates to totalWeeks", () => {
  assert.deepEqual(
    resolveTestWeekFlagsForSeason({ totalWeeks: 4, stored: [true, false] }),
    [true, false, false, false]
  );
  assert.deepEqual(
    resolveTestWeekFlagsForSeason({ totalWeeks: 2, stored: [true, false, true] }),
    [true, false]
  );
  assert.deepEqual(
    resolveTestWeekFlagsForSeason({ totalWeeks: 3, stored: null }),
    [false, false, false]
  );
});

test("isTestWeekAtIndex reads a specific week", () => {
  assert.equal(isTestWeekAtIndex(1, [false, true, false]), true);
  assert.equal(isTestWeekAtIndex(0, [false, true, false]), false);
  assert.equal(isTestWeekAtIndex(5, [false, true]), false);
  assert.equal(isTestWeekAtIndex(0, null), false);
});
