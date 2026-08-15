import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maxHeartRateSchema, signalPreferenceSchema } from "@/lib/settings/api-schemas";

const base = {
  discipline: "RUN" as const,
  primarySignal: "PACE" as const,
  effectiveDate: "2026-08-12",
};

describe("maxHeartRateSchema", () => {
  it("accepts a bpm in range or null", () => {
    assert.equal(maxHeartRateSchema.safeParse({ maxHeartRateBpm: 190 }).success, true);
    assert.equal(maxHeartRateSchema.safeParse({ maxHeartRateBpm: null }).success, true);
  });

  it("rejects values outside 80–250", () => {
    assert.equal(maxHeartRateSchema.safeParse({ maxHeartRateBpm: 79 }).success, false);
    assert.equal(maxHeartRateSchema.safeParse({ maxHeartRateBpm: 251 }).success, false);
    assert.equal(maxHeartRateSchema.safeParse({ maxHeartRateBpm: 190.5 }).success, false);
  });
});

describe("signalPreferenceSchema", () => {
  it("accepts a preference without role overrides", () => {
    assert.equal(signalPreferenceSchema.safeParse(base).success, true);
  });

  it("accepts an empty role map, which clears overrides", () => {
    const result = signalPreferenceSchema.safeParse({ ...base, roleSignals: {} });
    assert.equal(result.success, true);
  });

  it("accepts a sparse role map", () => {
    const result = signalPreferenceSchema.safeParse({
      ...base,
      roleSignals: { EASY: "HEART_RATE" },
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.data?.roleSignals, { EASY: "HEART_RATE" });
  });

  it("accepts every role at once", () => {
    const result = signalPreferenceSchema.safeParse({
      ...base,
      roleSignals: {
        EASY: "HEART_RATE",
        MODERATE: "PACE",
        INTENSITY: "PACE",
        LONG: "HEART_RATE",
      },
    });
    assert.equal(result.success, true);
  });

  it("rejects unknown roles and signals", () => {
    assert.equal(
      signalPreferenceSchema.safeParse({ ...base, roleSignals: { BOGUS: "PACE" } }).success,
      false
    );
    assert.equal(
      signalPreferenceSchema.safeParse({ ...base, roleSignals: { EASY: "BOGUS" } }).success,
      false
    );
  });
});
