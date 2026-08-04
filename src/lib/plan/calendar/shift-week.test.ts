import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findNextSeasonWall,
  findSeasonContainingDate,
  planWeekShift,
  type SeasonDateRange,
  type ShiftWeekSession,
} from "@/lib/plan/calendar/shift-week";

const seasons: SeasonDateRange[] = [
  {
    id: "s1",
    name: "Fall Block",
    startDateKey: "2026-09-01",
    endDateKey: "2026-11-30",
  },
  {
    id: "s0",
    name: "Summer",
    startDateKey: "2026-06-01",
    endDateKey: "2026-08-15",
  },
];

function session(
  id: string,
  date: string,
  discipline: ShiftWeekSession["discipline"] = "BIKE",
  source = "FLEXIBLE"
): ShiftWeekSession {
  return { id, scheduledDateKey: date, discipline, source };
}

describe("planWeekShift", () => {
  it("finds containing and next-season wall", () => {
    assert.equal(findSeasonContainingDate("2026-08-10", seasons)?.id, "s0");
    assert.equal(findSeasonContainingDate("2026-08-20", seasons), null);
    assert.equal(findNextSeasonWall("2026-08-20", seasons)?.id, "s1");
  });

  it("rejects when weekStart is inside a season", () => {
    const plan = planWeekShift({
      weekStart: "2026-08-10",
      targetDate: "2026-08-12",
      sessions: [session("a", "2026-08-10")],
      seasons,
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "IN_SEASON");
  });

  it("shifts by arbitrary day offset and deletes past the wall", () => {
    const plan = planWeekShift({
      weekStart: "2026-08-17",
      targetDate: "2026-08-19", // +2 days
      sessions: [
        session("a", "2026-08-17"),
        session("b", "2026-08-29"), // +2 → 2026-08-31 still before wall
        session("c", "2026-08-30"), // +2 → 2026-09-01 on wall → delete
        session("d", "2026-08-31"), // +2 → 2026-09-02 past wall → delete
        session("race", "2026-08-20", "RUN", "RACE"),
        session("past", "2026-08-10"), // before anchor
      ],
      seasons,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.deltaDays, 2);
    assert.deepEqual(plan.moveIds.sort(), ["a", "b"]);
    assert.deepEqual(plan.deleteIds.sort(), ["c", "d"]);
    assert.equal(plan.wallDateKey, "2026-09-01");
    assert.equal(plan.wallSeason?.name, "Fall Block");
  });

  it("filters by discipline", () => {
    const plan = planWeekShift({
      weekStart: "2026-08-17",
      targetDate: "2026-08-24",
      discipline: "RUN",
      sessions: [
        session("bike", "2026-08-18", "BIKE"),
        session("run", "2026-08-18", "RUN"),
      ],
      seasons,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual(plan.moveIds, ["run"]);
    assert.deepEqual(plan.deleteIds, []);
  });

  it("returns NO_OP when target equals weekStart", () => {
    const plan = planWeekShift({
      weekStart: "2026-08-17",
      targetDate: "2026-08-17",
      sessions: [session("a", "2026-08-17")],
      seasons,
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "NO_OP");
  });

  it("allows shift with no wall when no future season", () => {
    const plan = planWeekShift({
      weekStart: "2026-12-01",
      targetDate: "2026-12-08",
      sessions: [session("a", "2026-12-01"), session("b", "2027-01-01")],
      seasons,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.deltaDays, 7);
    assert.deepEqual(plan.moveIds.sort(), ["a", "b"]);
    assert.deepEqual(plan.deleteIds, []);
    assert.equal(plan.wallSeason, null);
  });
});
