import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDurationWindow,
  meanMaxBest,
  meanMaxBestLow,
  mergeMeanMaxCurves,
} from "./mean-max";

describe("meanMaxBest", () => {
  it("finds peak sustained power over a flat series", () => {
    const values = Array.from({ length: 100 }, () => 200);
    const durs = Array.from({ length: 100 }, () => 1);
    const points = meanMaxBest(values, durs, [5, 30, 60]);
    assert.equal(points.length, 3);
    for (const p of points) {
      assert.ok(Math.abs(p.value - 200) < 1e-6);
    }
  });

  it("prefers the higher plateau for short windows", () => {
    const values = [
      ...Array.from({ length: 20 }, () => 100),
      ...Array.from({ length: 10 }, () => 300),
      ...Array.from({ length: 20 }, () => 100),
    ];
    const durs = Array.from({ length: values.length }, () => 1);
    const points = meanMaxBest(values, durs, [5, 10, 30]);
    const by5 = points.find((p) => p.durationSec === 5)!;
    const by10 = points.find((p) => p.durationSec === 10)!;
    const by30 = points.find((p) => p.durationSec === 30)!;
    assert.ok(Math.abs(by5.value - 300) < 1e-6);
    assert.ok(Math.abs(by10.value - 300) < 1e-6);
    assert.ok(by30.value < 300);
    assert.ok(by30.value > 100);
  });
});

describe("meanMaxBestLow", () => {
  it("finds best (lowest) pace window", () => {
    const values = [
      ...Array.from({ length: 20 }, () => 300),
      ...Array.from({ length: 10 }, () => 240),
      ...Array.from({ length: 20 }, () => 300),
    ];
    const durs = Array.from({ length: values.length }, () => 1);
    const points = meanMaxBestLow(values, durs, [5, 10]);
    assert.ok(Math.abs(points[0].value - 240) < 1e-6);
  });
});

describe("mergeMeanMaxCurves", () => {
  it("takes the better value per duration", () => {
    const merged = mergeMeanMaxCurves(
      [
        [
          { durationSec: 5, value: 200 },
          { durationSec: 60, value: 180 },
        ],
        [
          { durationSec: 5, value: 250 },
          { durationSec: 60, value: 160 },
        ],
      ],
      "max"
    );
    assert.deepEqual(merged, [
      { durationSec: 5, value: 250 },
      { durationSec: 60, value: 180 },
    ]);
  });
});

describe("formatDurationWindow", () => {
  it("formats common windows", () => {
    assert.equal(formatDurationWindow(5), "5s");
    assert.equal(formatDurationWindow(60), "1m");
    assert.equal(formatDurationWindow(1200), "20m");
    assert.equal(formatDurationWindow(3600), "1h");
  });
});
