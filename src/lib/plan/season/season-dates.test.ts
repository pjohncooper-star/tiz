import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDateKey } from "@/lib/dates";
import {
  buildSeasonDateBounds,
  computeTotalWeeks,
  deriveSeasonStatus,
  findOverlappingSeason,
  normalizeSeasonDateRange,
  seasonRangesOverlap,
  snapEndToSunday,
  snapStartToMonday,
} from "./season-dates";

describe("season-dates", () => {
  it("snaps start to Monday and end to Sunday", () => {
    const wed = parseDateKey("2025-01-15");
    const start = snapStartToMonday(wed);
    assert.equal(start.toISOString().slice(0, 10), "2025-01-13");
    const end = snapEndToSunday(wed);
    assert.equal(end.toISOString().slice(0, 10), "2025-01-19");
  });

  it("computes total weeks from date range", () => {
    const bounds = buildSeasonDateBounds(
      parseDateKey("2025-01-15"),
      parseDateKey("2025-02-09")
    );
    assert.equal(bounds.totalWeeks, 4);
    assert.equal(
      computeTotalWeeks(bounds.startDate, bounds.endDate),
      bounds.totalWeeks
    );
  });

  it("detects overlapping seasons", () => {
    const a = {
      startDate: parseDateKey("2025-01-01"),
      endDate: parseDateKey("2025-03-01"),
    };
    const b = {
      startDate: parseDateKey("2025-02-15"),
      endDate: parseDateKey("2025-05-01"),
    };
    assert.equal(seasonRangesOverlap(a, b), true);
    const c = {
      startDate: parseDateKey("2025-04-01"),
      endDate: parseDateKey("2025-06-01"),
    };
    assert.equal(seasonRangesOverlap(a, c), false);
  });

  it("excludes same season id from overlap check", () => {
    const season = {
      id: "s1",
      startDate: parseDateKey("2025-01-01"),
      endDate: parseDateKey("2025-03-01"),
    };
    assert.equal(
      findOverlappingSeason(season, [{ ...season }]),
      undefined
    );
  });

  it("derives draft status when start is more than 28 days away", () => {
    const today = parseDateKey("2025-01-01");
    const start = parseDateKey("2025-03-01");
    const end = parseDateKey("2025-06-01");
    assert.equal(deriveSeasonStatus(start, end, today), "DRAFT");
  });

  it("derives active status within 4 weeks of start", () => {
    const today = parseDateKey("2025-02-10");
    const { startDate, endDate } = normalizeSeasonDateRange(
      parseDateKey("2025-03-01"),
      parseDateKey("2025-06-01")
    );
    assert.equal(deriveSeasonStatus(startDate, endDate, today), "ACTIVE");
  });

  it("derives completed status after end date", () => {
    const today = parseDateKey("2025-07-01");
    const start = parseDateKey("2025-01-01");
    const end = parseDateKey("2025-03-01");
    assert.equal(deriveSeasonStatus(start, end, today), "COMPLETED");
  });
});
