import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rollupTreeToZoneMinutes } from "@/lib/workout/workout-tree";
import {
  formatIntervalLength,
  generateWeekPalette,
  intervalZoneMinutes,
  paletteZoneTotal,
  recomputeWorkout,
  roundToQuarterMinute,
  type DisciplineBudget,
} from "./generate-workouts";

describe("generate-workouts", () => {
  it("computes zone minutes as reps x length", () => {
    assert.equal(intervalZoneMinutes(10, 180), 30);
    assert.equal(intervalZoneMinutes(6, 60), 6);
  });

  it("rounds interval length to the nearest 15s (min 15)", () => {
    assert.equal(roundToQuarterMinute(200), 195);
    assert.equal(roundToQuarterMinute(7), 15);
    assert.equal(roundToQuarterMinute(180), 180);
  });

  it("formats interval lengths", () => {
    assert.equal(formatIntervalLength(180), "3'");
    assert.equal(formatIntervalLength(20), '20"');
    assert.equal(formatIntervalLength(90), "1'30\"");
  });

  it("splits a zone target across intense days", () => {
    const budgets: DisciplineBudget[] = [
      { discipline: "BIKE", intenseDaysPerWeek: 2, remainingByZone: { 4: 40 } },
    ];
    const cards = generateWeekPalette(budgets).filter((c) => c.kind === "interval");
    assert.equal(cards.length, 2);
    // 40 min Z4 / 2 days = 20 min/day, default 3' work => ~7 reps each.
    assert.equal(cards[0]!.zone, 4);
    assert.equal(cards[0]!.reps, 7);
    assert.equal(cards[1]!.reps, 7);
  });

  it("interval tree rolls up to the intended hard-zone minutes", () => {
    const budgets: DisciplineBudget[] = [
      { discipline: "RUN", intenseDaysPerWeek: 1, remainingByZone: { 3: 30 } },
    ];
    const card = generateWeekPalette(budgets).find((c) => c.kind === "interval")!;
    const rollup = rollupTreeToZoneMinutes(card.tree);
    assert.equal(rollup[String(card.zone)], card.zoneMinutes);
  });

  it("emits strides for run and spin-ups for bike as Z5 priming", () => {
    const budgets: DisciplineBudget[] = [
      { discipline: "RUN", intenseDaysPerWeek: 1, remainingByZone: {} },
      { discipline: "BIKE", intenseDaysPerWeek: 1, remainingByZone: {} },
    ];
    const priming = generateWeekPalette(budgets).filter((c) => c.kind === "priming");
    assert.equal(priming.length, 2);
    const strides = priming.find((c) => c.primingKind === "strides")!;
    assert.equal(strides.discipline, "RUN");
    assert.equal(strides.zone, 5);
    const spinUps = priming.find((c) => c.primingKind === "spin_ups")!;
    assert.equal(spinUps.discipline, "BIKE");
    assert.equal(spinUps.zone, 5);
  });

  it("tracks running totals per zone and updates on recompute", () => {
    const budgets: DisciplineBudget[] = [
      { discipline: "BIKE", intenseDaysPerWeek: 2, remainingByZone: { 4: 40 } },
    ];
    let cards = generateWeekPalette(budgets).filter((c) => c.kind === "interval");
    const initial = paletteZoneTotal(cards, "BIKE", 4);
    assert.ok(initial > 0);

    // User sets the first card to 10x3' -> 30 min.
    cards = cards.map((c, i) => (i === 0 ? recomputeWorkout(c, { reps: 10 }) : c));
    const updated = paletteZoneTotal(cards, "BIKE", 4);
    assert.equal(cards[0]!.zoneMinutes, 30);
    assert.equal(updated, 30 + cards[1]!.zoneMinutes);
  });

  it("keeps priming length fixed when reps change", () => {
    const priming = generateWeekPalette([
      { discipline: "RUN", intenseDaysPerWeek: 1, remainingByZone: {} },
    ]).find((c) => c.kind === "priming")!;
    const updated = recomputeWorkout(priming, { reps: 8, workLenSeconds: 120 });
    assert.equal(updated.reps, 8);
    assert.equal(updated.workLenSeconds, priming.workLenSeconds);
  });
});
