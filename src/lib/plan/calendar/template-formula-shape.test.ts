import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCatalogFormulaToItems,
  applyCatalogPairing,
  defaultZoneForRole,
  fixedPackGroups,
  mixShareError,
  packFixedGroup,
  resolveTemplateFormulaWeek,
  templateDisciplineHasMix,
  planCatalogPairing,
  sessionRoleForFormulaSession,
  templateFormulaSlotOverride,
  templateFormulaZoneMinutes,
  type FormulaTemplateItem,
  type PairableTemplateItem,
} from "./template-formula-shape";

function nsSlots(minReps = 3): FormulaTemplateItem[] {
  const base = {
    discipline: "RUN" as const,
    sessionRole: "INTENSITY" as const,
    zone: 3,
    shapeKind: "FIXED" as const,
    restSeconds: 60,
    minReps,
    warmupSeconds: 0,
    cooldownSeconds: 0,
  };
  return [
    { ...base, sharePercent: 33, workSeconds: 180 },
    { ...base, sharePercent: 33, workSeconds: 360 },
    { ...base, sharePercent: 34, workSeconds: 600 },
  ];
}

function mainSeconds(work: number, rest: number, reps: number): number {
  return reps * work + Math.max(0, reps - 1) * rest;
}

describe("template formula mix helpers", () => {
  it("detects a mix when shares are present", () => {
    assert.equal(templateDisciplineHasMix(nsSlots(), "RUN"), true);
    assert.equal(templateDisciplineHasMix(nsSlots(), "BIKE"), false);
    assert.equal(mixShareError(nsSlots(), "RUN"), null);
  });

  it("requires shares to total 100", () => {
    const items = nsSlots();
    items[0]!.sharePercent = 10;
    assert.match(mixShareError(items, "RUN") ?? "", /100%/);
  });

  it("allows duration-based extras alongside a complete mix", () => {
    const items: FormulaTemplateItem[] = [
      ...nsSlots(),
      { discipline: "RUN", sessionRole: "EASY", durationMinutes: 30 },
    ];
    assert.equal(mixShareError(items, "RUN"), null);
    assert.equal(templateFormulaSlotOverride(items, "RUN")?.sessions, 3);
  });

  it("defaults zones by role", () => {
    assert.equal(defaultZoneForRole("EASY"), 1);
    assert.equal(defaultZoneForRole("MODERATE"), 2);
    assert.equal(defaultZoneForRole("LONG"), 2);
    assert.equal(defaultZoneForRole("INTENSITY"), 3);
  });
});

describe("fixedPackGroups", () => {
  it("groups fixed sessions by sport and zone", () => {
    const items: FormulaTemplateItem[] = [
      ...nsSlots(),
      { ...nsSlots()[0]!, discipline: "BIKE" },
      { ...nsSlots()[0]!, zone: 4 },
      { discipline: "RUN", sessionRole: "LONG", sharePercent: 20, shapeKind: "STEADY" },
    ];
    assert.deepEqual(fixedPackGroups(items), [[0, 1, 2]]);
  });

  it("ignores fixed sessions without a share or work interval", () => {
    const items: FormulaTemplateItem[] = [
      { ...nsSlots()[0]!, sharePercent: null },
      { ...nsSlots()[1]!, workSeconds: null },
      nsSlots()[2]!,
    ];
    assert.deepEqual(fixedPackGroups(items), []);
  });
});

describe("planCatalogPairing", () => {
  const formula = {
    id: "f",
    name: "F",
    discipline: "RUN" as const,
    sessions: [
      { sharePercent: 20, zone: 1 as const, intensity: false, long: false },
      { sharePercent: 30, zone: 3 as const, intensity: true, long: false },
      { sharePercent: 50, zone: 2 as const, intensity: false, long: true },
    ],
  };

  it("pairs long and intensity roles first, then the rest by weekday", () => {
    const items: PairableTemplateItem[] = [
      { discipline: "RUN", sessionRole: "LONG", weekday: "SUN", sortOrder: 0 },
      { discipline: "RUN", sessionRole: "MODERATE", weekday: "MON", sortOrder: 0 },
      { discipline: "BIKE", sessionRole: "EASY", weekday: "MON", sortOrder: 1 },
      { discipline: "RUN", sessionRole: "INTENSITY", weekday: "THU", sortOrder: 0 },
    ];
    const pairing = planCatalogPairing(items, formula);
    assert.deepEqual(
      pairing.pairs.map((pair) => [pair.itemIndex, pair.session.sharePercent]),
      [
        [1, 20],
        [3, 30],
        [0, 50],
      ]
    );
    assert.deepEqual(pairing.missing, []);
    assert.deepEqual(pairing.extra, []);
  });

  it("reports missing formula sessions and extra template slots", () => {
    const short = planCatalogPairing(
      [{ discipline: "RUN", sessionRole: "INTENSITY", weekday: "TUE" }],
      formula
    );
    assert.equal(short.pairs.length, 1);
    assert.equal(short.pairs[0]!.session.intensity, true);
    assert.equal(short.missing.length, 2);

    const items: PairableTemplateItem[] = [
      { discipline: "RUN", sessionRole: "EASY", weekday: "MON" },
      { discipline: "RUN", sessionRole: "EASY", weekday: "TUE" },
      { discipline: "RUN", sessionRole: "INTENSITY", weekday: "WED" },
      { discipline: "RUN", sessionRole: "LONG", weekday: "SAT" },
      { discipline: "RUN", sessionRole: "EASY", weekday: "SUN", sharePercent: 10 },
    ];
    const long = planCatalogPairing(items, formula);
    assert.deepEqual(long.extra, [1, 4]);
    const applied = applyCatalogPairing(items, long);
    assert.equal(applied[1]!.sharePercent, null);
    assert.equal(applied[4]!.sharePercent, null);
    assert.equal(mixShareError(applied, "RUN"), null);
  });

  it("maps formula sessions to template roles", () => {
    assert.equal(sessionRoleForFormulaSession(formula.sessions[0]!), "EASY");
    assert.equal(sessionRoleForFormulaSession(formula.sessions[1]!), "INTENSITY");
    assert.equal(sessionRoleForFormulaSession(formula.sessions[2]!), "LONG");
  });
});

describe("packFixedGroup", () => {
  it("promotes 3'+6' into a 10' instead of leaving spare short reps", () => {
    const slots = nsSlots(3);
    const promoted = packFixedGroup(
      slots,
      mainSeconds(180, 60, 4) + mainSeconds(360, 60, 4) + mainSeconds(600, 60, 3)
    );
    assert.deepEqual(promoted, [3, 3, 4]);
  });

  it("adds a 3' rep when promote is blocked by minReps", () => {
    const slots = nsSlots(3);
    const afterPromote = packFixedGroup(
      slots,
      mainSeconds(180, 60, 3) + mainSeconds(360, 60, 3) + mainSeconds(600, 60, 4)
    );
    assert.deepEqual(afterPromote, [3, 3, 4]);

    const added = packFixedGroup(
      slots,
      mainSeconds(180, 60, 3) +
        mainSeconds(360, 60, 3) +
        mainSeconds(600, 60, 4) +
        mainSeconds(180, 60, 1) +
        60
    );
    assert.deepEqual(added, [4, 3, 4]);
  });
});

describe("resolveTemplateFormulaWeek", () => {
  it("rolls warmup and rest into Z1/Z2 on a Z3 interval day", () => {
    const items: FormulaTemplateItem[] = [
      {
        discipline: "RUN",
        sessionRole: "INTENSITY",
        sharePercent: 100,
        zone: 3,
        shapeKind: "FIXED",
        workSeconds: 180,
        restSeconds: 60,
        minReps: 1,
        warmupSeconds: 600,
        cooldownSeconds: 300,
      },
    ];
    const resolved = resolveTemplateFormulaWeek(items, { RUN: 1 });
    const session = resolved[0]!;
    assert.ok(session.targetZones["3"]! > 0);
    assert.ok((session.targetZones["2"] ?? 0) > 0);
    assert.ok((session.targetZones["1"] ?? 0) > 0);
    const z3 = session.targetZones["3"]!;
    const total = Object.values(session.targetZones).reduce((sum, n) => sum + n, 0);
    assert.ok(z3 < total);
  });

  it("keeps easy days as Z1/Z2 steady blocks", () => {
    const items: FormulaTemplateItem[] = [
      {
        discipline: "RUN",
        sessionRole: "EASY",
        sharePercent: 40,
        zone: 2,
        shapeKind: "STEADY",
      },
      {
        discipline: "RUN",
        sessionRole: "LONG",
        sharePercent: 60,
        zone: 2,
        shapeKind: "STEADY",
      },
    ];
    const zones = templateFormulaZoneMinutes(items, "RUN", 2);
    assert.equal(zones[3], 0);
    assert.ok(zones[2] > 0);
  });
});

describe("applyCatalogFormulaToItems", () => {
  it("stamps shares and zones onto matching roles", () => {
    const items: FormulaTemplateItem[] = [
      { discipline: "RUN", sessionRole: "INTENSITY" },
      { discipline: "RUN", sessionRole: "LONG" },
      { discipline: "BIKE", sessionRole: "EASY" },
    ];
    const next = applyCatalogFormulaToItems(items, {
      id: "ns",
      name: "NS",
      discipline: "RUN",
      sessions: [
        { sharePercent: 40, zone: 3, intensity: true, long: false },
        { sharePercent: 60, zone: 2, intensity: false, long: true },
      ],
    });
    if ("error" in next) throw new Error(next.error);
    assert.equal(next[0]!.sharePercent, 40);
    assert.equal(next[0]!.zone, 3);
    assert.equal(next[0]!.shapeKind, "FIXED");
    assert.equal(next[0]!.workSeconds, 360);
    assert.equal(next[1]!.sharePercent, 60);
    assert.equal(next[1]!.shapeKind, "STEADY");
    assert.equal(next[2]!.sharePercent, undefined);
  });
});

describe("applyCatalogFormulaToItems count mismatch", () => {
  it("errors when the template and formula session counts differ", () => {
    const next = applyCatalogFormulaToItems([{ discipline: "RUN", sessionRole: "EASY" }], {
      id: "ns",
      name: "NS",
      discipline: "RUN",
      sessions: [
        { sharePercent: 50, zone: 1, intensity: false, long: false },
        { sharePercent: 50, zone: 2, intensity: false, long: true },
      ],
    });
    assert.ok("error" in next);
  });
});
