import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferSessionRole,
  nextSessionRole,
  resolveDisplaySessionRole,
  sessionRoleShowsBadge,
} from "./session-role";

describe("session-role", () => {
  it("cycles roles in order", () => {
    assert.equal(nextSessionRole("MODERATE"), "INTENSITY");
    assert.equal(nextSessionRole("LONG"), "EASY");
    assert.equal(nextSessionRole("EASY"), "MODERATE");
  });

  it("infers intensity and long from title", () => {
    assert.equal(
      inferSessionRole({ title: "Threshold intervals", discipline: "BIKE" }),
      "INTENSITY"
    );
    assert.equal(inferSessionRole({ title: "Long run", discipline: "RUN" }), "LONG");
    assert.equal(inferSessionRole({ title: "Easy spin", discipline: "BIKE" }), "EASY");
    assert.equal(inferSessionRole({ title: "Morning race", discipline: "RUN" }), "INTENSITY");
    assert.equal(inferSessionRole({ title: "Shakeout jog", discipline: "RUN" }), "EASY");
  });

  it("infers long from duration", () => {
    assert.equal(
      inferSessionRole({ title: "Bike", discipline: "BIKE", durationMinutes: 120 }),
      "LONG"
    );
  });

  it("infers easy/intensity from stream intensity vs threshold", () => {
    assert.equal(
      inferSessionRole({
        title: "Afternoon run",
        discipline: "RUN",
        durationMinutes: 40,
        primarySignal: "HEART_RATE",
        thresholdValue: 170,
        streams: { meta: { avgHeartRate: 130 } },
      }),
      "EASY"
    );
    assert.equal(
      inferSessionRole({
        title: "Afternoon run",
        discipline: "RUN",
        durationMinutes: 40,
        primarySignal: "HEART_RATE",
        thresholdValue: 170,
        streams: { meta: { avgHeartRate: 165 } },
      }),
      "INTENSITY"
    );
  });

  it("infers from workout RPE meta", () => {
    assert.equal(
      inferSessionRole({
        title: "Run",
        discipline: "RUN",
        durationMinutes: 40,
        primarySignal: "PACE",
        thresholdValue: 300,
        streams: { meta: { workoutRpe: 25 } },
      }),
      "EASY"
    );
  });

  it("keeps explicit stored role over inference", () => {
    assert.equal(
      resolveDisplaySessionRole({
        sessionRole: "INTENSITY",
        title: "Easy run",
        discipline: "RUN",
      }),
      "INTENSITY"
    );
  });

  it("infers when stored role is moderate", () => {
    const role = resolveDisplaySessionRole({
      sessionRole: "MODERATE",
      title: "VO2 set",
      discipline: "RUN",
    });
    assert.equal(role, "INTENSITY");
    assert.equal(sessionRoleShowsBadge(role), true);
  });
});
