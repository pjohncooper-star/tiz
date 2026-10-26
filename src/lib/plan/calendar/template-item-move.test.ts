import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moveTemplateItem } from "./template-item-move";

type Row = { key: string; weekday: string; sortOrder: number };

const week: Row[] = [
  { key: "a", weekday: "MON", sortOrder: 0 },
  { key: "b", weekday: "MON", sortOrder: 1 },
  { key: "c", weekday: "MON", sortOrder: 2 },
  { key: "d", weekday: "TUE", sortOrder: 0 },
];

function day(rows: Row[], weekday: string): string[] {
  return rows
    .filter((row) => row.weekday === weekday)
    .sort((x, y) => x.sortOrder - y.sortOrder)
    .map((row) => `${row.key}${row.sortOrder}`);
}

describe("moveTemplateItem", () => {
  it("moves a session to another day at the drop position", () => {
    const next = moveTemplateItem(week, "b", "TUE", 0);
    assert.deepEqual(day(next, "MON"), ["a0", "c1"]);
    assert.deepEqual(day(next, "TUE"), ["b0", "d1"]);
  });

  it("appends when dropped past the end of a day", () => {
    const next = moveTemplateItem(week, "a", "TUE", 5);
    assert.deepEqual(day(next, "TUE"), ["d0", "a1"]);
    assert.deepEqual(day(next, "MON"), ["b0", "c1"]);
  });

  it("moves onto an empty day", () => {
    const next = moveTemplateItem(week, "c", "SUN", 0);
    assert.deepEqual(day(next, "SUN"), ["c0"]);
    assert.deepEqual(day(next, "MON"), ["a0", "b1"]);
  });

  it("reorders within a day using drop positions", () => {
    assert.deepEqual(day(moveTemplateItem(week, "a", "MON", 3), "MON"), ["b0", "c1", "a2"]);
    assert.deepEqual(day(moveTemplateItem(week, "c", "MON", 0), "MON"), ["c0", "a1", "b2"]);
    assert.deepEqual(day(moveTemplateItem(week, "a", "MON", 2), "MON"), ["b0", "a1", "c2"]);
  });

  it("returns the same array when the drop leaves the order unchanged", () => {
    assert.equal(moveTemplateItem(week, "b", "MON", 1), week);
    assert.equal(moveTemplateItem(week, "b", "MON", 2), week);
    assert.equal(moveTemplateItem(week, "missing", "MON", 0), week);
  });

  it("renumbers gaps in sort order", () => {
    const gappy: Row[] = [
      { key: "x", weekday: "WED", sortOrder: 3 },
      { key: "y", weekday: "WED", sortOrder: 7 },
    ];
    const next = moveTemplateItem(gappy, "x", "THU", 0);
    assert.deepEqual(day(next, "WED"), ["y0"]);
    assert.deepEqual(day(next, "THU"), ["x0"]);
  });
});
