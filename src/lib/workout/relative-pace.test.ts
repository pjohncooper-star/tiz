import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseRelativePaceToken,
  resolveRelativePaceSeconds,
  formatRelativePaceLabel,
  parseRacePaceAnchors,
} from "@/lib/workout/relative-pace";

describe("relative pace", () => {
  it("parses ref and percent tokens", () => {
    assert.deepEqual(parseRelativePaceToken("10k"), { ref: "10k" });
    assert.deepEqual(parseRelativePaceToken("threshold"), { ref: "threshold" });
    assert.deepEqual(parseRelativePaceToken("95%|10k"), { ref: "10k", pct: 95 });
    assert.deepEqual(parseRelativePaceToken("95% of half"), {
      ref: "half",
      pct: 95,
    });
    assert.equal(typeof parseRelativePaceToken("easy"), "string");
  });

  it("resolves percent of speed against anchors", () => {
    // 7:30/mi ≈ 279.4 s/km — use round numbers: 300 s/km threshold
    const ctx = {
      thresholdPaceSeconds: 300,
      racePaces: { "5k": 270, "10k": 285, half: 300, marathon: 330 },
    };
    assert.equal(
      resolveRelativePaceSeconds({ ref: "threshold" }, ctx),
      300
    );
    assert.equal(resolveRelativePaceSeconds({ ref: "5k" }, ctx), 270);
    // 95% speed → more seconds (slower)
    assert.ok(
      Math.abs(
        (resolveRelativePaceSeconds({ ref: "10k", pct: 95 }, ctx) ?? 0) -
          (285 * 100) / 95
      ) < 1e-9
    );
    assert.equal(
      resolveRelativePaceSeconds({ ref: "5k" }, { racePaces: {} }),
      null
    );
    assert.equal(
      resolveRelativePaceSeconds({ ref: "max" }, ctx),
      null
    );
    assert.equal(
      resolveRelativePaceSeconds({ ref: "lthr" }, ctx),
      null
    );
  });

  it("prefers goal anchors when refSource is goal", () => {
    const ctx = {
      racePaces: { marathon: 330, goalMarathon: 310 },
    };
    assert.equal(
      resolveRelativePaceSeconds(
        { ref: "marathon", refSource: "goal" },
        ctx
      ),
      310
    );
    assert.equal(
      resolveRelativePaceSeconds({ ref: "marathon" }, ctx),
      330
    );
  });

  it("formats labels", () => {
    assert.equal(formatRelativePaceLabel({ ref: "10k" }), "10k pace");
    assert.equal(
      formatRelativePaceLabel({ ref: "half", pct: 95 }),
      "95% HM pace"
    );
  });

  it("parses race pace anchors JSON", () => {
    assert.deepEqual(parseRacePaceAnchors({ "5k": 270, junk: 1 }), {
      "5k": 270,
    });
    assert.deepEqual(parseRacePaceAnchors(null), {});
  });

  it("re-resolves when anchors change (mid-plan update)", () => {
    const target = { ref: "5k" as const, pct: 100 };
    assert.equal(
      resolveRelativePaceSeconds(target, { racePaces: { "5k": 280 } }),
      280
    );
    assert.equal(
      resolveRelativePaceSeconds(target, { racePaces: { "5k": 260 } }),
      260
    );
  });
});
