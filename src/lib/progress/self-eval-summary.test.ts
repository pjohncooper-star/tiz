import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeSelfEval } from "./self-eval-summary";

describe("summarizeSelfEval", () => {
  it("returns null without rows or recorded metrics", () => {
    assert.equal(summarizeSelfEval([]), null);
    assert.equal(
      summarizeSelfEval([
        { rpe: null, freshness: null, sleep: null, motivation: null, soreness: null },
      ]),
      null
    );
  });

  it("averages each metric over the rows that recorded it", () => {
    const summary = summarizeSelfEval([
      { rpe: 6, freshness: 4, sleep: null, motivation: null, soreness: 2 },
      { rpe: 7, freshness: null, sleep: null, motivation: null, soreness: 3 },
    ]);
    assert.deepEqual(summary, {
      count: 2,
      rpe: 6.5,
      freshness: 4,
      sleep: null,
      motivation: null,
      soreness: 2.5,
    });
  });
});
