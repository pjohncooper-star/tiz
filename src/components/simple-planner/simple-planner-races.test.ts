import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyRace } from "@/components/simple-planner/simple-planner-types";
import {
  isGoalEventComplete,
  isGoalEventPartial,
} from "@/components/season/season-settings-types";

describe("simple planner race slots", () => {
  it("new B/C race rows are empty slots, not partial", () => {
    const b = emptyRace("B");
    const c = emptyRace("C");
    assert.equal(isGoalEventComplete(b), false);
    assert.equal(isGoalEventPartial(b), false);
    assert.equal(isGoalEventComplete(c), false);
    assert.equal(isGoalEventPartial(c), false);
  });

  it("detects partially filled B race after user starts editing", () => {
    const partial = { ...emptyRace("B"), name: "Tune-up", disciplines: ["RUN"] };
    assert.equal(isGoalEventPartial(partial), true);
    assert.equal(
      isGoalEventComplete({ ...partial, date: "2026-06-01" }),
      true
    );
  });
});
