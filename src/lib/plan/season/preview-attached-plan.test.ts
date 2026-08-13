import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import { previewAttachedPlanWeeks } from "./preview-attached-plan";

function week(weekIndex: number, weekStartDate: string): SimpleWeek {
  return {
    weekIndex,
    weekStartDate,
    isRestWeek: false,
    swimHours: 2,
    bikeHours: 4,
    runHours: 1,
    totalHours: 7,
    zoneMinutes: {},
  };
}

describe("previewAttachedPlanWeeks", () => {
  it("stamps attached vs paused coverage and floors plan hours", () => {
    const result = previewAttachedPlanWeeks(
      [week(0, "2026-03-02"), week(1, "2026-03-09")],
      {
        trainingPlanId: "plan-1",
        trainingPlanName: "Book",
        durationDays: 7,
        sessionCount: 1,
        anchorMode: "start",
        anchorDate: "2026-03-02",
        goalEventId: null,
        pausedWeeks: [{ weekStartDate: "2026-03-09", weekCount: 1 }],
        startDate: null,
        endDate: null,
      },
      [
        {
          dayOffset: 0,
          sortOrder: 0,
          discipline: "RUN",
          sessionRole: "EASY",
          estimatedDurationMinutes: 180,
          steps: null,
        },
      ],
      "2026-01-01"
    );

    assert.equal(result.window?.startDate, "2026-03-02");
    assert.equal(result.weeks[0]?.planCoverage, "attached");
    assert.equal(result.weeks[1]?.planCoverage, "paused");
    assert.ok((result.weeks[0]?.runHours ?? 0) >= 3);
    assert.equal(result.weeks[1]?.runHours, 1);
  });
});
