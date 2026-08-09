import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSearchHitsNewestFirst,
  decodeSearchCursor,
  encodeSearchCursor,
  isAfterSearchCursor,
  parseSearchTagFilter,
  type TrainingSearchHit,
} from "@/lib/plan/search";

function hit(
  partial: Pick<TrainingSearchHit, "kind" | "id" | "dateKey">
): TrainingSearchHit {
  return {
    title: partial.id,
    discipline: "RUN",
    durationMinutes: 60,
    distanceMeters: 10000,
    tags: [],
    weekHref: "/calendar?week=2026-01-05",
    detailHref: "/workouts/x",
    ...partial,
  };
}

describe("search cursor", () => {
  it("round-trips", () => {
    const cursor = { dateKey: "2026-03-01", kind: "session" as const, id: "abc" };
    assert.deepEqual(decodeSearchCursor(encodeSearchCursor(cursor)), cursor);
  });

  it("rejects invalid cursors", () => {
    assert.equal(decodeSearchCursor("nope"), null);
    assert.equal(decodeSearchCursor("2026-03-01|foo|id"), null);
  });
});

describe("compareSearchHitsNewestFirst", () => {
  it("orders by date desc then session before activity", () => {
    const a = hit({ kind: "activity", id: "a1", dateKey: "2026-03-02" });
    const b = hit({ kind: "session", id: "s1", dateKey: "2026-03-02" });
    const c = hit({ kind: "session", id: "s0", dateKey: "2026-03-01" });
    const sorted = [c, a, b].sort(compareSearchHitsNewestFirst);
    assert.deepEqual(
      sorted.map((h) => `${h.dateKey}:${h.kind}:${h.id}`),
      ["2026-03-02:session:s1", "2026-03-02:activity:a1", "2026-03-01:session:s0"]
    );
  });
});

describe("isAfterSearchCursor", () => {
  it("pages past the cursor in newest-first order", () => {
    const cursor = { dateKey: "2026-03-02", kind: "session" as const, id: "s1" };
    assert.equal(
      isAfterSearchCursor(hit({ kind: "activity", id: "a1", dateKey: "2026-03-02" }), cursor),
      true
    );
    assert.equal(
      isAfterSearchCursor(hit({ kind: "session", id: "s0", dateKey: "2026-03-01" }), cursor),
      true
    );
    assert.equal(
      isAfterSearchCursor(hit({ kind: "session", id: "s1", dateKey: "2026-03-02" }), cursor),
      false
    );
  });
});

describe("parseSearchTagFilter", () => {
  it("normalizes and dedupes tags", () => {
    assert.deepEqual(parseSearchTagFilter("Tempo, tempo, Long"), ["tempo", "long"]);
  });
});
