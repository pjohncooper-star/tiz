import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgressParams, progressHref, shiftWeekStart } from "./href";

describe("progress href", () => {
  it("defaults to the current week view", () => {
    assert.deepEqual(parseProgressParams({}, "2026-08-19"), {
      view: "week",
      weekStart: "2026-08-17",
    });
  });

  it("snaps a mid-week date to its Monday and honours the season view", () => {
    assert.deepEqual(parseProgressParams({ view: "season", week: "2026-08-22" }, "2026-10-01"), {
      view: "season",
      weekStart: "2026-08-17",
    });
  });

  it("ignores malformed or impossible dates and unknown views", () => {
    assert.deepEqual(parseProgressParams({ view: "nope", week: "2026-13-45" }, "2026-08-19"), {
      view: "week",
      weekStart: "2026-08-17",
    });
    assert.deepEqual(parseProgressParams({ week: "garbage" }, "2026-08-19").weekStart, "2026-08-17");
  });

  it("builds links and shifts weeks across month boundaries", () => {
    assert.equal(progressHref({ view: "season" }), "/progress?view=season");
    assert.equal(
      progressHref({ view: "week", weekStart: "2026-08-17" }),
      "/progress?view=week&week=2026-08-17"
    );
    assert.equal(shiftWeekStart("2026-08-31", 1), "2026-09-07");
    assert.equal(shiftWeekStart("2026-08-03", -1), "2026-07-27");
  });
});
