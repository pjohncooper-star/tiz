import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weekIndexForDate } from "@/lib/plan/season/season-dates";
import { parseDateKey } from "@/lib/dates";

describe("calendar week target matching", () => {
  it("maps a calendar Monday to season week index when start dates align", () => {
    const seasonStart = parseDateKey("2026-06-01");
    const calendarMonday = parseDateKey("2026-08-10");

    const weekIndex = weekIndexForDate(seasonStart, calendarMonday);
    assert.equal(weekIndex, 10);

    const seasonWeekStart = parseDateKey("2026-06-01");
    seasonWeekStart.setUTCDate(seasonWeekStart.getUTCDate() + weekIndex * 7);
    const storedKey = seasonWeekStart.toISOString().slice(0, 10);
    assert.equal(storedKey, "2026-08-10");
  });
});
