import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGoalTimeDisplay,
  formatGoalTimeInput,
  parseGoalTimeInput,
} from "./goal-time";

describe("goal time", () => {
  it("formats minutes as H:MM:SS", () => {
    assert.equal(formatGoalTimeInput(90), "1:30:00");
    assert.equal(formatGoalTimeDisplay(210), "3:30:00");
  });

  it("parses hh:mm:ss to minutes", () => {
    assert.equal(parseGoalTimeInput("1:30:00"), 90);
    assert.equal(parseGoalTimeInput("3:30:00"), 210);
  });

  it("parses mm:ss to minutes", () => {
    assert.equal(parseGoalTimeInput("45:30"), 46);
  });

  it("returns null for empty input", () => {
    assert.equal(parseGoalTimeInput(""), null);
    assert.equal(formatGoalTimeInput(null), "");
  });
});
