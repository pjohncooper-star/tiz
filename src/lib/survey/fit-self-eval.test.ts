import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayQualityFromFitSelfEval,
  dayQualityFromRoleUnexpectedRpe,
  dayQualityFromWorkoutFeel,
  effectiveDayQuality,
} from "@/lib/survey/fit-self-eval";

describe("day quality feel-first scoring", () => {
  it("maps Normal feel to GOOD regardless of high RPE without a role", () => {
    assert.equal(dayQualityFromWorkoutFeel(50), "GOOD");
    assert.equal(dayQualityFromFitSelfEval(50, 7), "GOOD");
    assert.equal(dayQualityFromFitSelfEval(50, 10), "GOOD");
  });

  it("does not score absolute RPE alone", () => {
    assert.equal(dayQualityFromFitSelfEval(null, 8), null);
    assert.equal(dayQualityFromFitSelfEval(undefined, 9, "INTENSITY"), null);
  });

  it("flags unexpectedly hard easy days via RPE", () => {
    assert.equal(dayQualityFromRoleUnexpectedRpe(5, "EASY"), null);
    assert.equal(dayQualityFromRoleUnexpectedRpe(6, "EASY"), "ROUGH");
    assert.equal(dayQualityFromRoleUnexpectedRpe(7, "EASY"), "BAD");
    assert.equal(dayQualityFromFitSelfEval(50, 7, "EASY"), "BAD");
    assert.equal(dayQualityFromFitSelfEval(75, 6, "EASY"), "ROUGH");
  });

  it("only lightly flags very hard long days", () => {
    assert.equal(dayQualityFromRoleUnexpectedRpe(8, "LONG"), null);
    assert.equal(dayQualityFromRoleUnexpectedRpe(9, "LONG"), "ROUGH");
    assert.equal(dayQualityFromFitSelfEval(50, 9, "LONG"), "ROUGH");
    assert.equal(dayQualityFromFitSelfEval(50, 7, "LONG"), "GOOD");
  });

  it("ignores RPE for intensity and moderate roles", () => {
    assert.equal(dayQualityFromRoleUnexpectedRpe(10, "INTENSITY"), null);
    assert.equal(dayQualityFromRoleUnexpectedRpe(10, "MODERATE"), null);
    assert.equal(dayQualityFromFitSelfEval(50, 9, "INTENSITY"), "GOOD");
    assert.equal(dayQualityFromFitSelfEval(50, 9, "MODERATE"), "GOOD");
  });

  it("keeps weak feel as Bad even on intensity days", () => {
    assert.equal(dayQualityFromFitSelfEval(10, 8, "INTENSITY"), "BAD");
    assert.equal(dayQualityFromFitSelfEval(25, 3, "EASY"), "ROUGH");
  });

  it("effectiveDayQuality does not re-apply absolute RPE", () => {
    assert.equal(effectiveDayQuality("GOOD", 9), "GOOD");
    assert.equal(effectiveDayQuality("GOOD", 9, "INTENSITY"), "GOOD");
    assert.equal(effectiveDayQuality("GOOD", 7, "EASY"), "BAD");
  });
});
