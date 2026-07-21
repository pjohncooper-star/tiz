import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOCUS_TOP_OFFSET_PX,
  calendarStickyOffsetPx,
  pickFirstFullyVisibleWeek,
} from "./week-scroll-focus";

describe("calendarStickyOffsetPx", () => {
  it("returns base header offset without editor band", () => {
    assert.equal(
      calendarStickyOffsetPx({ editorBandHeightPx: 240, includeEditorBand: false }),
      FOCUS_TOP_OFFSET_PX
    );
  });

  it("adds editor band height when included", () => {
    assert.equal(
      calendarStickyOffsetPx({ editorBandHeightPx: 240, includeEditorBand: true }),
      FOCUS_TOP_OFFSET_PX + 240
    );
  });

  it("clamps negative band height to zero", () => {
    assert.equal(
      calendarStickyOffsetPx({ editorBandHeightPx: -10, includeEditorBand: true }),
      FOCUS_TOP_OFFSET_PX
    );
  });
});

describe("pickFirstFullyVisibleWeek", () => {
  const sticky = 72;

  it("returns null for empty input", () => {
    assert.equal(pickFirstFullyVisibleWeek([], sticky), null);
  });

  it("picks the topmost week that is fully below sticky chrome", () => {
    // Jul 13 clipped under header; Jul 20 first fully visible; Jul 27 further down
    const week = pickFirstFullyVisibleWeek(
      [
        { weekStart: "2026-07-13", top: -40 },
        { weekStart: "2026-07-20", top: 80 },
        { weekStart: "2026-07-27", top: 900 },
      ],
      sticky
    );
    assert.equal(week, "2026-07-20");
  });

  it("treats tops within slop of sticky offset as fully visible", () => {
    const week = pickFirstFullyVisibleWeek(
      [
        { weekStart: "2026-07-13", top: 65 },
        { weekStart: "2026-07-20", top: 200 },
      ],
      sticky,
      8
    );
    assert.equal(week, "2026-07-13");
  });

  it("falls back to nearest week when all are clipped above sticky offset", () => {
    const week = pickFirstFullyVisibleWeek(
      [
        { weekStart: "2026-07-06", top: -200 },
        { weekStart: "2026-07-13", top: -50 },
      ],
      sticky
    );
    assert.equal(week, "2026-07-13");
  });

  it("picks week aligned exactly at sticky offset", () => {
    const week = pickFirstFullyVisibleWeek(
      [
        { weekStart: "2026-07-13", top: -10 },
        { weekStart: "2026-07-20", top: 72 },
      ],
      sticky
    );
    assert.equal(week, "2026-07-20");
  });
});
