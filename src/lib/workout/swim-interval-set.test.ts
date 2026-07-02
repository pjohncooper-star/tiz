import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFitStepManifest } from "@/lib/workout/fit-step-manifest";
import {
  collectFitMessageIndices,
  expandExecutionOccurrences,
} from "@/lib/plan/workout-execution";
import {
  defaultSwimIntervalSet,
  formatSwimIntervalLabel,
  parseSwimIntervalSet,
  swimIntervalRestSeconds,
  swimIntervalSetDurationSeconds,
  swimIntervalToFlatSteps,
} from "@/lib/workout/swim-interval-set";
import {
  parseWorkoutTree,
  totalTreeDurationSeconds,
} from "@/lib/workout/workout-tree";

const sendoffSet = defaultSwimIntervalSet();

const fixedSet = {
  kind: "swim_interval" as const,
  repeatCount: 8,
  distanceMeters: 100,
  restMode: "fixed" as const,
  fixedRestSeconds: 20,
  target: { signal: "pace" as const, mode: "zone" as const, zone: 4 },
  targetPaceSeconds: 90,
};

describe("formatSwimIntervalLabel", () => {
  it("formats send-off notation", () => {
    assert.equal(formatSwimIntervalLabel(sendoffSet, "LCM", "METRIC"), "10×100m on 1:30");
  });

  it("formats fixed rest notation", () => {
    assert.equal(formatSwimIntervalLabel(fixedSet, "SCY", "IMPERIAL"), "8×109 rest 20s");
  });
});

describe("swimIntervalSetDurationSeconds", () => {
  it("uses send-off interval for sendoff mode", () => {
    assert.equal(swimIntervalSetDurationSeconds(sendoffSet), 10 * 90);
  });

  it("uses swim time plus fixed rest for fixed mode", () => {
    assert.equal(swimIntervalSetDurationSeconds(fixedSet), 8 * (90 + 20));
  });
});

describe("swimIntervalRestSeconds", () => {
  it("subtracts estimated swim time from send-off", () => {
    const pacedSendoff = { ...sendoffSet, targetPaceSeconds: 90, target: { signal: "pace" as const, mode: "value" as const } };
    assert.equal(swimIntervalRestSeconds(pacedSendoff, 90), 0);
  });

  it("returns fixed rest duration", () => {
    assert.equal(swimIntervalRestSeconds(fixedSet), 20);
  });
});

describe("swimIntervalToFlatSteps", () => {
  it("expands to swim and rest steps per repeat", () => {
    const flat = swimIntervalToFlatSteps(fixedSet);
    assert.equal(flat.length, 16);
    assert.equal(flat[0].distanceMeters, 100);
    assert.equal(flat[1].durationSeconds, 20);
  });
});

describe("parseSwimIntervalSet", () => {
  it("round-trips through workout tree parse", () => {
    const tree = parseWorkoutTree({ version: 2, nodes: [sendoffSet] });
    assert.equal(tree.nodes.length, 1);
    assert.equal(tree.nodes[0].kind, "swim_interval");
    if (tree.nodes[0].kind !== "swim_interval") return;
    assert.equal(tree.nodes[0].repeatCount, 10);
    assert.equal(tree.nodes[0].sendOffSeconds, 90);
  });

  it("rejects invalid sendoff without time", () => {
    assert.equal(
      parseSwimIntervalSet({
        kind: "swim_interval",
        repeatCount: 5,
        distanceMeters: 100,
        restMode: "sendoff",
        target: { signal: "pace", mode: "zone", zone: 4 },
      }),
      null
    );
  });
});

describe("totalTreeDurationSeconds", () => {
  it("counts swim interval send-off totals", () => {
    const sec = totalTreeDurationSeconds([sendoffSet]);
    assert.equal(sec, 900);
  });
});

describe("swim interval execution", () => {
  it("expands grouped swim and rest rows", () => {
    const rows = expandExecutionOccurrences([fixedSet], "SWIM");
    assert.equal(rows.length, 16);
    assert.equal(rows[0].groupLabel, "Interval 1");
    assert.equal(rows[0].label, "Swim");
    assert.equal(rows[1].label, "Rest");
  });
});

describe("swim interval fit manifest", () => {
  it("assigns repeat header then child steps", () => {
    const indices = collectFitMessageIndices([fixedSet]);
    assert.deepEqual(indices, [0, 1, 2]);
    const manifest = buildFitStepManifest([fixedSet], "SWIM");
    assert.equal(manifest[0].kind, "repeat");
    assert.equal(manifest[0].repeatCount, 8);
  });
});
