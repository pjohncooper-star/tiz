import assert from "node:assert/strict";
import { test } from "node:test";
import {
  templateScopeSchema,
  templateScopeFromParams,
  templateScopeKey,
  templateScopeToQuery,
} from "./template-scope";

test("schema accepts DEFAULT with no ids", () => {
  const r = templateScopeSchema.safeParse({ kind: "DEFAULT" });
  assert.equal(r.success, true);
});

test("schema requires seasonPhaseId for PHASE", () => {
  assert.equal(
    templateScopeSchema.safeParse({ kind: "PHASE", seasonPhaseId: "p1" }).success,
    true
  );
  assert.equal(templateScopeSchema.safeParse({ kind: "PHASE" }).success, false);
  assert.equal(
    templateScopeSchema.safeParse({ kind: "PHASE", seasonPhaseId: "" }).success,
    false
  );
});

test("schema requires seasonPlanId for REST/TEST", () => {
  assert.equal(
    templateScopeSchema.safeParse({ kind: "REST", seasonPlanId: "s1" }).success,
    true
  );
  assert.equal(
    templateScopeSchema.safeParse({ kind: "TEST", seasonPlanId: "s1" }).success,
    true
  );
  assert.equal(templateScopeSchema.safeParse({ kind: "REST" }).success, false);
});

test("templateScopeFromParams defaults to DEFAULT", () => {
  assert.deepEqual(templateScopeFromParams({}), { kind: "DEFAULT" });
  assert.deepEqual(templateScopeFromParams({ kind: null }), { kind: "DEFAULT" });
});

test("templateScopeFromParams reads scoped kinds (case-insensitive)", () => {
  assert.deepEqual(templateScopeFromParams({ kind: "phase", seasonPhaseId: "p1" }), {
    kind: "PHASE",
    seasonPhaseId: "p1",
  });
  assert.deepEqual(templateScopeFromParams({ kind: "REST", seasonPlanId: "s1" }), {
    kind: "REST",
    seasonPlanId: "s1",
  });
});

test("templateScopeFromParams throws when a scoped id is missing", () => {
  assert.throws(() => templateScopeFromParams({ kind: "PHASE" }));
  assert.throws(() => templateScopeFromParams({ kind: "TEST" }));
});

test("templateScopeKey is stable and distinct", () => {
  assert.equal(templateScopeKey({ kind: "DEFAULT" }), "DEFAULT");
  assert.equal(
    templateScopeKey({ kind: "PHASE", seasonPhaseId: "p1" }),
    "PHASE:p1"
  );
  assert.equal(templateScopeKey({ kind: "REST", seasonPlanId: "s1" }), "REST:s1");
  assert.equal(templateScopeKey({ kind: "TEST", seasonPlanId: "s1" }), "TEST:s1");
});

test("templateScopeToQuery round-trips through templateScopeFromParams", () => {
  const scopes = [
    { kind: "DEFAULT" as const },
    { kind: "PHASE" as const, seasonPhaseId: "p1" },
    { kind: "REST" as const, seasonPlanId: "s1" },
    { kind: "TEST" as const, seasonPlanId: "s1" },
  ];
  for (const scope of scopes) {
    assert.deepEqual(templateScopeFromParams(templateScopeToQuery(scope)), scope);
  }
});
