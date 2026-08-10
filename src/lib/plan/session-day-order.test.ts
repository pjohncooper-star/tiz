import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSessionsForDayOrder,
  daySortOrdersFromIds,
  formatScheduledTimeLabel,
  formatScheduledTimeMinutes,
  parseTimeInputToMinutes,
  validateUntimedDayReorder,
} from "@/lib/plan/session-day-order";

describe("parseTimeInputToMinutes", () => {
  it("parses HH:MM and empty", () => {
    assert.equal(parseTimeInputToMinutes("06:30"), 390);
    assert.equal(parseTimeInputToMinutes("23:59"), 1439);
    assert.equal(parseTimeInputToMinutes(""), null);
    assert.equal(parseTimeInputToMinutes("25:00"), null);
  });
});

describe("formatScheduledTimeMinutes / label", () => {
  it("round-trips 24h and formats AM/PM label", () => {
    assert.equal(formatScheduledTimeMinutes(390), "06:30");
    assert.equal(formatScheduledTimeLabel(390), "6:30 AM");
    assert.equal(formatScheduledTimeLabel(13 * 60 + 5), "1:05 PM");
  });
});

describe("compareSessionsForDayOrder", () => {
  it("orders timed before untimed, then by clock / daySortOrder", () => {
    const timedEarly = {
      id: "a",
      scheduledTimeMinutes: 360,
      daySortOrder: 9,
      title: "Z",
    };
    const timedLate = {
      id: "b",
      scheduledTimeMinutes: 480,
      daySortOrder: 0,
      title: "A",
    };
    const untimedFirst = {
      id: "c",
      scheduledTimeMinutes: null,
      daySortOrder: 0,
      title: "Easy",
    };
    const untimedSecond = {
      id: "d",
      scheduledTimeMinutes: null,
      daySortOrder: 1,
      title: "Long",
    };
    const sorted = [untimedSecond, timedLate, untimedFirst, timedEarly].sort(
      compareSessionsForDayOrder
    );
    assert.deepEqual(
      sorted.map((s) => s.id),
      ["a", "b", "c", "d"]
    );
  });
});

describe("validateUntimedDayReorder", () => {
  const day = [
    { id: "t1", scheduledTimeMinutes: 400, daySortOrder: 0, title: "Timed" },
    { id: "u1", scheduledTimeMinutes: null, daySortOrder: 0, title: "A" },
    { id: "u2", scheduledTimeMinutes: null, daySortOrder: 1, title: "B" },
  ];

  it("accepts a permutation of untimed ids", () => {
    assert.equal(
      validateUntimedDayReorder({
        daySessions: day,
        orderedUntimedIds: ["u2", "u1"],
      }).ok,
      true
    );
  });

  it("rejects timed ids and incomplete lists", () => {
    assert.equal(
      validateUntimedDayReorder({
        daySessions: day,
        orderedUntimedIds: ["t1", "u1", "u2"],
      }).ok,
      false
    );
    assert.equal(
      validateUntimedDayReorder({
        daySessions: day,
        orderedUntimedIds: ["u1"],
      }).ok,
      false
    );
  });
});

describe("daySortOrdersFromIds", () => {
  it("assigns contiguous indexes", () => {
    assert.deepEqual(
      [...daySortOrdersFromIds(["x", "y"]).entries()],
      [
        ["x", 0],
        ["y", 1],
      ]
    );
  });
});
