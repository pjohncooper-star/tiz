import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planWeekMaterialization,
  planSeasonMaterialization,
  phaseTemplateIdForWeek,
  type MaterializeOptions,
  type MaterializeTemplate,
  type WeekMaterializationContext,
} from "./materialize-templates";

function template(id: string): MaterializeTemplate {
  return {
    id,
    items: [
      {
        weekday: "MON",
        discipline: "BIKE",
        title: "Endurance",
        durationMinutes: 60,
        distanceMeters: null,
        poolSize: null,
        sessionRole: "MODERATE",
      },
      {
        weekday: "SAT",
        discipline: "RUN",
        title: "Long run",
        durationMinutes: 90,
        distanceMeters: null,
        poolSize: null,
        sessionRole: "LONG",
      },
    ],
  };
}

function opts(overrides: Partial<MaterializeOptions> = {}): MaterializeOptions {
  return {
    restTemplateId: null,
    testTemplateId: null,
    deLoadVolumePercent: 75,
    templatesById: new Map([
      ["phase-1", template("phase-1")],
      ["rest-1", template("rest-1")],
      ["test-1", template("test-1")],
    ]),
    ...overrides,
  };
}

const baseCtx: WeekMaterializationContext = {
  weekIndex: 0,
  weekStartKey: "2026-01-05", // Monday
  isDeLoadWeek: false,
  isTestWeek: false,
  phaseTemplateId: null,
};

test("normal week expands the phase template onto weekday dates", () => {
  const plan = planWeekMaterialization(
    { ...baseCtx, phaseTemplateId: "phase-1" },
    opts()
  );
  assert.equal(plan.kind, "PHASE");
  assert.equal(plan.templateId, "phase-1");
  assert.equal(plan.sessions.length, 2);
  assert.equal(plan.sessions[0]!.scheduledDateKey, "2026-01-05"); // Mon
  assert.equal(plan.sessions[1]!.scheduledDateKey, "2026-01-10"); // Sat
  assert.equal(plan.sessions[0]!.durationMinutes, 60);
  assert.equal(plan.sessions[0]!.suppressTiz, false);
});

test("normal week with no phase template produces nothing", () => {
  const plan = planWeekMaterialization(baseCtx, opts());
  assert.equal(plan.kind, "NONE");
  assert.equal(plan.templateId, null);
  assert.deepEqual(plan.sessions, []);
});

test("de-load week uses rest template with scaled duration", () => {
  const plan = planWeekMaterialization(
    { ...baseCtx, isDeLoadWeek: true, phaseTemplateId: "phase-1" },
    opts({ restTemplateId: "rest-1", deLoadVolumePercent: 50 })
  );
  assert.equal(plan.kind, "REST");
  assert.equal(plan.templateId, "rest-1");
  assert.equal(plan.sessions[0]!.durationMinutes, 30); // 60 * 0.5
  assert.equal(plan.sessions[1]!.durationMinutes, 45); // 90 * 0.5
});

test("de-load week falls back to phase template, still scaled", () => {
  const plan = planWeekMaterialization(
    { ...baseCtx, isDeLoadWeek: true, phaseTemplateId: "phase-1" },
    opts({ deLoadVolumePercent: 75 })
  );
  assert.equal(plan.kind, "PHASE");
  assert.equal(plan.sessions[0]!.durationMinutes, 45); // 60 * 0.75
});

test("test week uses test template and suppresses TiZ without scaling", () => {
  const plan = planWeekMaterialization(
    { ...baseCtx, isTestWeek: true, isDeLoadWeek: true, phaseTemplateId: "phase-1" },
    opts({ testTemplateId: "test-1", restTemplateId: "rest-1" })
  );
  assert.equal(plan.kind, "TEST");
  assert.equal(plan.templateId, "test-1");
  assert.equal(plan.sessions[0]!.durationMinutes, 60); // no scaling on test weeks
  assert.equal(plan.sessions[0]!.suppressTiz, true);
});

test("scaled duration never drops below 1 minute", () => {
  const tpl: MaterializeTemplate = {
    id: "tiny",
    items: [
      {
        weekday: "MON",
        discipline: "SWIM",
        title: "Recovery",
        durationMinutes: 1,
        distanceMeters: null,
        poolSize: "SCM",
        sessionRole: "EASY",
      },
    ],
  };
  const plan = planWeekMaterialization(
    { ...baseCtx, isDeLoadWeek: true, phaseTemplateId: "tiny" },
    opts({ deLoadVolumePercent: 10, templatesById: new Map([["tiny", tpl]]) })
  );
  assert.equal(plan.sessions[0]!.durationMinutes, 1);
});

test("phaseTemplateIdForWeek maps weeks to the covering phase", () => {
  const phases = [
    { startWeekIndex: 0, endWeekIndex: 3, weeklyTemplateId: "base" },
    { startWeekIndex: 4, endWeekIndex: 7, weeklyTemplateId: "build" },
    { startWeekIndex: 8, endWeekIndex: 9, weeklyTemplateId: null },
  ];
  assert.equal(phaseTemplateIdForWeek(0, phases), "base");
  assert.equal(phaseTemplateIdForWeek(3, phases), "base");
  assert.equal(phaseTemplateIdForWeek(5, phases), "build");
  assert.equal(phaseTemplateIdForWeek(8, phases), null);
  assert.equal(phaseTemplateIdForWeek(20, phases), null);
});

test("phaseTemplateIdForWeek ignores unassigned phases", () => {
  const phases = [{ startWeekIndex: -1, endWeekIndex: -1, weeklyTemplateId: "x" }];
  assert.equal(phaseTemplateIdForWeek(0, phases), null);
});

test("planSeasonMaterialization maps every week", () => {
  const weeks: WeekMaterializationContext[] = [
    { ...baseCtx, weekIndex: 0, phaseTemplateId: "phase-1" },
    { ...baseCtx, weekIndex: 1, weekStartKey: "2026-01-12", phaseTemplateId: null },
  ];
  const plans = planSeasonMaterialization(weeks, opts());
  assert.equal(plans.length, 2);
  assert.equal(plans[0]!.sessions.length, 2);
  assert.equal(plans[1]!.sessions.length, 0);
});

test("extra intensity converts templated long run to intensity in place", () => {
  const plan = planWeekMaterialization(
    {
      ...baseCtx,
      phaseTemplateId: "phase-1",
      runLongSeat: { kind: "extra_intensity" },
      bikeLongSeat: { kind: "full_long" },
    },
    opts()
  );
  const run = plan.sessions.find((s) => s.discipline === "RUN");
  assert.ok(run);
  assert.equal(run!.sessionRole, "INTENSITY");
  assert.equal(run!.poolSlotKind, "INTENSITY");
  assert.equal(run!.title, "Intensity run");
  assert.equal(run!.durationMinutes, 90);
  assert.equal(run!.scheduledDateKey, "2026-01-10");
});

test("omit long seat drops the templated long workout", () => {
  const plan = planWeekMaterialization(
    {
      ...baseCtx,
      phaseTemplateId: "phase-1",
      runLongSeat: { kind: "omit" },
    },
    opts()
  );
  assert.equal(plan.sessions.some((s) => s.discipline === "RUN"), false);
  assert.equal(plan.sessions.length, 1);
});

test("substitute endurance rewrites long bike duration and slot", () => {
  const tpl: MaterializeTemplate = {
    id: "bike-long",
    items: [
      {
        weekday: "SUN",
        discipline: "BIKE",
        title: "Long ride",
        durationMinutes: 180,
        distanceMeters: null,
        poolSize: null,
        sessionRole: "LONG",
      },
    ],
  };
  const plan = planWeekMaterialization(
    {
      ...baseCtx,
      phaseTemplateId: "bike-long",
      bikeLongSeat: { kind: "substitute_endurance", durationMinutes: 90 },
    },
    opts({ templatesById: new Map([["bike-long", tpl]]) })
  );
  assert.equal(plan.sessions.length, 1);
  assert.equal(plan.sessions[0]!.sessionRole, "EASY");
  assert.equal(plan.sessions[0]!.poolSlotKind, "SUBSTITUTE_ENDURANCE");
  assert.equal(plan.sessions[0]!.durationMinutes, 90);
  assert.equal(plan.sessions[0]!.title, "Endurance ride");
});
