import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedComparisonDuration } from "@/lib/plan/session-stats";

describe("completedComparisonDuration", () => {
  it("formats canonical duration as H:MM:SS", () => {
    const value = completedComparisonDuration(
      {
        stats: [{ label: "Duration", value: "45:30" }],
        zoneMinutes: {},
        activities: [],
        canonical: { durationMinutes: 45.5, distanceMeters: null, targetSpeedMps: null, targetPaceSeconds: null },
      },
      "RUN"
    );
    assert.equal(value, "0:45:30");
  });

  it("reformats stat duration when canonical is absent", () => {
    const value = completedComparisonDuration(
      {
        stats: [{ label: "Moving", value: "1:02:15" }],
        zoneMinutes: {},
        activities: [],
      },
      "BIKE"
    );
    assert.equal(value, "1:02:15");
  });

  it("uses elapsed for swim", () => {
    const value = completedComparisonDuration(
      {
        stats: [
          { label: "Elapsed", value: "32:10" },
          { label: "Moving", value: "28:00" },
        ],
        zoneMinutes: {},
        activities: [],
        canonical: { durationMinutes: 32 + 10 / 60, distanceMeters: 2000, targetSpeedMps: null, targetPaceSeconds: 96 },
      },
      "SWIM"
    );
    assert.equal(value, "0:32:10");
  });
});
