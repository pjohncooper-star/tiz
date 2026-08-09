import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeWorkoutTag,
  normalizeWorkoutTags,
  workoutTagNames,
  WORKOUT_TAG_MAX_COUNT,
  WORKOUT_TAG_MAX_LENGTH,
} from "@/lib/plan/workout-tags";

describe("normalizeWorkoutTag", () => {
  it("trims and lowercases name while preserving label casing", () => {
    assert.deepEqual(normalizeWorkoutTag("  Tempo  "), {
      name: "tempo",
      label: "Tempo",
    });
  });

  it("collapses internal whitespace", () => {
    assert.deepEqual(normalizeWorkoutTag("long   ride"), {
      name: "long ride",
      label: "long ride",
    });
  });

  it("rejects empty and oversized tags", () => {
    assert.equal(normalizeWorkoutTag("   "), null);
    assert.equal(normalizeWorkoutTag("x".repeat(WORKOUT_TAG_MAX_LENGTH + 1)), null);
  });
});

describe("normalizeWorkoutTags", () => {
  it("dedupes by lowercase name and preserves first label", () => {
    assert.deepEqual(normalizeWorkoutTags(["Tempo", "tempo", "Long"]), [
      { name: "tempo", label: "Tempo" },
      { name: "long", label: "Long" },
    ]);
  });

  it("caps tag count", () => {
    const raw = Array.from({ length: WORKOUT_TAG_MAX_COUNT + 5 }, (_, i) => `tag-${i}`);
    assert.equal(normalizeWorkoutTags(raw).length, WORKOUT_TAG_MAX_COUNT);
  });
});

describe("workoutTagNames", () => {
  it("returns lowercase names only", () => {
    assert.deepEqual(workoutTagNames(["A", "b"]), ["a", "b"]);
  });
});
