import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workoutTreeToZwo } from "@/lib/workout/export-zwo";
import {
  absoluteFromPercent,
  percentFromAbsolute,
  resolveRampValues,
  resolveTargetMidpoint,
  resolveTargetValues,
  targetPercent,
} from "@/lib/workout/target-units";
import {
  flattenForPlanning,
  parseWorkoutTree,
  targetZoneFromTarget,
  totalTreeDurationMinutes,
  type StepTarget,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";

describe("target unit conversion", () => {
  it("round-trips power between watts and % of FTP", () => {
    assert.equal(percentFromAbsolute("power", 180, 200), 90);
    assert.equal(absoluteFromPercent("power", 90, 200), 180);
    assert.equal(absoluteFromPercent("power", 90, 300), 270);
  });

  it("treats pace percent as % of threshold speed", () => {
    // Faster than threshold means fewer seconds but a higher percentage.
    assert.equal(percentFromAbsolute("pace", 270, 300), 111.1);
    assert.equal(absoluteFromPercent("pace", 111.1, 300), 270);
    assert.equal(percentFromAbsolute("pace", 300, 300), 100);
  });

  it("round-trips heart rate against the stored threshold", () => {
    assert.equal(percentFromAbsolute("heart_rate", 152, 190), 80);
    assert.equal(absoluteFromPercent("heart_rate", 80, 190), 152);
  });

  it("rejects non-positive inputs", () => {
    assert.equal(percentFromAbsolute("power", 0, 200), null);
    assert.equal(percentFromAbsolute("power", 180, 0), null);
    assert.equal(absoluteFromPercent("power", -5, 200), null);
  });

  it("resolves percent targets to native units", () => {
    const target: StepTarget = {
      signal: "power",
      mode: "range",
      low: 88,
      high: 94,
      unit: "percent",
    };
    assert.deepEqual(resolveTargetValues(target, { ftpWatts: 250 }), {
      low: 220,
      high: 235,
    });
    assert.equal(resolveTargetMidpoint(target, { ftpWatts: 250 }), 227.5);
  });

  it("leaves percent values alone when the threshold is unknown", () => {
    const target: StepTarget = {
      signal: "power",
      mode: "value",
      value: 88,
      unit: "percent",
    };
    assert.deepEqual(resolveTargetValues(target, {}), { value: 88 });
  });

  it("passes absolute targets through untouched", () => {
    const target: StepTarget = { signal: "power", mode: "value", value: 220 };
    assert.deepEqual(resolveTargetValues(target, { ftpWatts: 250 }), { value: 220 });
    assert.equal(targetPercent(target, { ftpWatts: 250 }), 88);
  });

  it("resolves ramp endpoints", () => {
    assert.deepEqual(
      resolveRampValues(
        { signal: "power", low: 50, high: 100, unit: "percent" },
        { ftpWatts: 200 }
      ),
      { low: 100, high: 200 }
    );
  });
});

describe("percent targets in zone resolution", () => {
  it("bins percent power on FTP boundaries, not as a zone index", () => {
    assert.equal(
      targetZoneFromTarget({ signal: "power", mode: "value", value: 4, unit: "percent" }),
      1
    );
    assert.equal(
      targetZoneFromTarget({ signal: "power", mode: "value", value: 88, unit: "percent" }),
      3
    );
    assert.equal(
      targetZoneFromTarget({ signal: "power", mode: "value", value: 130, unit: "percent" }),
      5
    );
  });

  it("bins percent pace as % of threshold speed", () => {
    const easy: StepTarget = { signal: "pace", mode: "value", value: 70, unit: "percent" };
    const threshold: StepTarget = {
      signal: "pace",
      mode: "value",
      value: 100,
      unit: "percent",
    };
    assert.equal(targetZoneFromTarget(easy, { discipline: "RUN" }), 1);
    assert.equal(targetZoneFromTarget(threshold, { discipline: "RUN" }), 4);
  });

  it("still reads small absolute low/high pairs as zone ranges", () => {
    assert.equal(targetZoneFromTarget({ signal: "power", mode: "range", low: 2, high: 4 }), 3);
  });
});

describe("percent pace in planning steps", () => {
  const nodes: WorkoutNode[] = [
    {
      kind: "step",
      intensity: "active",
      duration: { type: "distance", value: 5000 },
      target: { signal: "pace", mode: "value", value: 111.1, unit: "percent" },
    },
  ];

  it("resolves pace from the athlete's threshold at read time", () => {
    const atFiveMin = flattenForPlanning(nodes, {
      discipline: "RUN",
      thresholdPaceSeconds: 300,
    });
    assert.equal(atFiveMin[0]!.targetPaceSeconds, 270);
    assert.equal(atFiveMin[0]!.durationSeconds, 1350);

    // A faster athlete runs the same relative effort at a faster pace.
    const atFourMin = flattenForPlanning(nodes, {
      discipline: "RUN",
      thresholdPaceSeconds: 240,
    });
    assert.equal(atFourMin[0]!.targetPaceSeconds, 216);
    assert.equal(atFourMin[0]!.durationSeconds, 1080);
  });

  it("estimates total duration for distance steps with a percent pace", () => {
    assert.equal(
      totalTreeDurationMinutes(nodes, { discipline: "RUN", thresholdPaceSeconds: 300 }),
      23
    );
    assert.equal(
      totalTreeDurationMinutes(nodes, { discipline: "RUN", thresholdPaceSeconds: 240 }),
      18
    );
  });

  it("falls back to a default threshold rather than a zero estimate", () => {
    assert.ok(totalTreeDurationMinutes(nodes, { discipline: "RUN" }) > 0);
  });
});

describe("percent targets survive storage", () => {
  it("round-trips the unit through parseWorkoutTree", () => {
    const parsed = parseWorkoutTree({
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "value", value: 105, unit: "percent" },
        },
        {
          kind: "ramp",
          duration: { type: "time", value: 600 },
          target: { signal: "power", low: 50, high: 100, unit: "percent" },
        },
      ],
    });
    const step = parsed.nodes[0]!;
    const ramp = parsed.nodes[1]!;
    if (step.kind !== "step" || ramp.kind !== "ramp") throw new Error("unexpected nodes");
    assert.equal(step.target.unit, "percent");
    assert.equal(ramp.target.unit, "percent");
  });

  it("drops an unrecognized unit", () => {
    const parsed = parseWorkoutTree({
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "value", value: 105, unit: "bananas" },
        },
      ],
    });
    const step = parsed.nodes[0]!;
    if (step.kind !== "step") throw new Error("unexpected node");
    assert.equal(step.target.unit, undefined);
  });
});

describe("zwo export of percent targets", () => {
  it("writes percent power straight through as an FTP fraction", () => {
    const zwo = workoutTreeToZwo("Relative", {
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 600 },
          target: { signal: "power", mode: "value", value: 88, unit: "percent" },
        },
      ],
    });
    assert.ok(zwo.includes('<SteadyState Duration="600" Power="0.88" />'), zwo);
  });
});
