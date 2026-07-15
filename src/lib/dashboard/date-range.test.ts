import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDashboardRange,
  cycleBoundsFromSeason,
} from "./date-range";

describe("resolveDashboardRange", () => {
  it("resolves last week ending today", () => {
    const range = resolveDashboardRange({
      preset: "last_week",
      todayKey: "2026-07-14",
    });
    assert.equal(range.from, "2026-07-08");
    assert.equal(range.to, "2026-07-14");
  });

  it("uses season bounds when available", () => {
    const range = resolveDashboardRange({
      preset: "this_season",
      todayKey: "2026-07-14",
      season: { startDate: "2026-03-02", endDate: "2026-10-25" },
    });
    assert.equal(range.from, "2026-03-02");
    assert.equal(range.to, "2026-07-14");
  });

  it("falls back when season missing", () => {
    const range = resolveDashboardRange({
      preset: "this_season",
      todayKey: "2026-07-14",
    });
    assert.equal(range.resolvedPreset, "last_3_months");
    assert.equal(range.from, "2026-04-16");
  });

  it("supports custom range and swaps inverted bounds", () => {
    const range = resolveDashboardRange({
      preset: "custom",
      todayKey: "2026-07-14",
      customFrom: "2026-07-20",
      customTo: "2026-07-01",
    });
    assert.equal(range.from, "2026-07-01");
    assert.equal(range.to, "2026-07-20");
  });
});

describe("cycleBoundsFromSeason", () => {
  it("finds the mesocycle containing today", () => {
    const bounds = cycleBoundsFromSeason({
      seasonStartDate: new Date("2026-03-02T12:00:00.000Z"),
      today: new Date("2026-07-14T12:00:00.000Z"),
      mesocycles: [
        { name: "Base 1", startWeekIndex: 0, endWeekIndex: 3 },
        { name: "Build 2", startWeekIndex: 16, endWeekIndex: 19 },
      ],
    });
    assert.ok(bounds);
    assert.equal(bounds?.name, "Build 2");
    assert.equal(bounds?.startDate, "2026-06-22");
    assert.equal(bounds?.endDate, "2026-07-19");
  });
});
