import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activitiesFuzzyMatch,
  fingerprintsForCandidate,
} from "@/lib/activity/match";
import {
  buildDedupFingerprint,
  buildNormalizedDedupFingerprint,
  normalizeStartTimeForMatch,
} from "@/lib/import/dedup";

describe("activitiesFuzzyMatch", () => {
  const base = {
    discipline: "RUN" as const,
    startTime: new Date("2026-06-01T12:00:00.000Z"),
    durationSeconds: 3600,
    distanceMeters: 10_000,
  };

  it("matches elapsed vs moving duration within tolerance", () => {
    assert.equal(
      activitiesFuzzyMatch(base, { ...base, durationSeconds: 3540 }),
      true
    );
  });

  it("matches start times 30s apart", () => {
    assert.equal(
      activitiesFuzzyMatch(base, {
        ...base,
        startTime: new Date("2026-06-01T12:00:30.000Z"),
      }),
      true
    );
  });

  it("rejects different discipline", () => {
    assert.equal(
      activitiesFuzzyMatch(base, { ...base, discipline: "BIKE" }),
      false
    );
  });

  it("rejects start times more than 2 minutes apart", () => {
    assert.equal(
      activitiesFuzzyMatch(base, {
        ...base,
        startTime: new Date("2026-06-01T12:03:00.000Z"),
      }),
      false
    );
  });
});

describe("normalized fingerprint", () => {
  it("is stable across sub-minute start drift", () => {
    const a = buildNormalizedDedupFingerprint(
      "RUN",
      new Date("2026-06-01T12:00:15.000Z"),
      3400,
      10_000
    );
    const b = buildNormalizedDedupFingerprint(
      "RUN",
      new Date("2026-06-01T12:00:45.000Z"),
      3400,
      10_000
    );
    assert.equal(a, b);
  });

  it("differs from legacy fingerprint when start has sub-minute component", () => {
    const start = new Date("2026-06-01T12:00:30.000Z");
    const legacy = buildDedupFingerprint("RUN", start, 3600, 10_000);
    const normalized = buildNormalizedDedupFingerprint("RUN", start, 3600, 10_000);
    assert.notEqual(legacy, normalized);
    assert.equal(
      normalized,
      buildNormalizedDedupFingerprint(
        "RUN",
        normalizeStartTimeForMatch(start),
        3600,
        10_000
      )
    );
  });

  it("fingerprintsForCandidate returns legacy and normalized", () => {
    const fps = fingerprintsForCandidate({
      discipline: "BIKE",
      startTime: new Date("2026-06-01T08:00:00.000Z"),
      durationSeconds: 5400,
      distanceMeters: 80_000,
    });
    assert.ok(fps.legacy.length === 32);
    assert.ok(fps.normalized.length === 32);
  });
});
