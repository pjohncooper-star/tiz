import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLongDraftNodes } from "@/lib/plan/calendar/spread-easy-tiz";
import {
  buildWorkoutProfile,
  defaultPrimarySignalForDiscipline,
} from "@/lib/workout/workout-profile";
import type { WorkoutNode } from "@/lib/workout/workout-tree";

describe("buildWorkoutProfile bike power zones", () => {
  it("orders long bike Z1 watts below Z2 watts", () => {
    const nodes = buildLongDraftNodes("BIKE", 124);
    const profile = buildWorkoutProfile(nodes, {
      primarySignal: defaultPrimarySignalForDiscipline("BIKE"),
      lengthView: "duration",
      discipline: "BIKE",
      thresholds: { thresholdFtpWatts: 200 },
    });

    const z1Fill = "#bae6fd";
    const z2Fill = "#38bdf8";
    const z1Segments = profile.segments.filter((s) => s.fill === z1Fill);
    const z2Segments = profile.segments.filter((s) => s.fill === z2Fill);

    assert.ok(z1Segments.length >= 2, "expected warm and cool Z1 segments");
    assert.equal(z2Segments.length, 1, "expected one steady Z2 segment");

    const z1Watts = z1Segments.map((s) => s.yHigh);
    const z2Watts = z2Segments[0]!.yHigh;

    for (const watts of z1Watts) {
      assert.ok(watts < z2Watts, `Z1 ${watts}W should be below Z2 ${z2Watts}W`);
    }
  });

  it("keeps power interval structure when primarySignal is HEART_RATE", () => {
    const nodes: WorkoutNode[] = [
      {
        kind: "repeat",
        repeatCount: 4,
        children: [
          {
            kind: "step",
            intensity: "interval",
            duration: { type: "time", value: 300 },
            target: { signal: "power", mode: "value", value: 250 },
          },
          {
            kind: "step",
            intensity: "recovery",
            duration: { type: "time", value: 180 },
            target: { signal: "power", mode: "value", value: 150 },
          },
        ],
      },
    ];
    const profile = buildWorkoutProfile(nodes, {
      primarySignal: "HEART_RATE",
      lengthView: "duration",
      discipline: "BIKE",
    });
    const heights = new Set(profile.segments.map((s) => s.yHigh));
    assert.ok(heights.has(250));
    assert.ok(heights.has(150));
    assert.equal(profile.yLabel, "Power (W)");
  });
});
