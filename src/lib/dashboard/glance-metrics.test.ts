import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLongestByDistance, type ActivityForLongest } from "./glance-metrics";

function activity(partial: Partial<ActivityForLongest> & Pick<ActivityForLongest, "id" | "discipline">): ActivityForLongest {
  return {
    name: partial.name ?? partial.id,
    startTime: partial.startTime ?? new Date("2026-07-01T12:00:00.000Z"),
    utcOffsetSeconds: partial.utcOffsetSeconds ?? 0,
    durationSeconds: partial.durationSeconds ?? 3600,
    distanceMeters: partial.distanceMeters ?? null,
    ...partial,
  };
}

describe("computeLongestByDistance", () => {
  it("returns the farthest run by distance", () => {
    const longest = computeLongestByDistance(
      [
        activity({ id: "a", discipline: "RUN", distanceMeters: 10_000 }),
        activity({ id: "b", discipline: "RUN", distanceMeters: 21_097 }),
        activity({ id: "c", discipline: "BIKE", distanceMeters: 80_000 }),
      ],
      "RUN"
    );
    assert.equal(longest?.id, "b");
    assert.equal(longest?.distanceMeters, 21_097);
  });

  it("returns the farthest ride by distance", () => {
    const longest = computeLongestByDistance(
      [
        activity({ id: "a", discipline: "BIKE", distanceMeters: 40_000 }),
        activity({ id: "b", discipline: "BIKE", distanceMeters: 95_000 }),
        activity({ id: "c", discipline: "RUN", distanceMeters: 30_000 }),
      ],
      "BIKE"
    );
    assert.equal(longest?.id, "b");
    assert.equal(longest?.distanceMeters, 95_000);
  });

  it("ignores missing or zero distance", () => {
    const longest = computeLongestByDistance(
      [
        activity({ id: "a", discipline: "RUN", distanceMeters: null }),
        activity({ id: "b", discipline: "RUN", distanceMeters: 0 }),
        activity({ id: "c", discipline: "RUN", distanceMeters: 8_000 }),
      ],
      "RUN"
    );
    assert.equal(longest?.id, "c");
  });

  it("breaks distance ties by duration then later start", () => {
    const longest = computeLongestByDistance(
      [
        activity({
          id: "early",
          discipline: "BIKE",
          distanceMeters: 50_000,
          durationSeconds: 7200,
          startTime: new Date("2026-07-01T08:00:00.000Z"),
        }),
        activity({
          id: "same-dist-longer",
          discipline: "BIKE",
          distanceMeters: 50_000,
          durationSeconds: 7800,
          startTime: new Date("2026-07-02T08:00:00.000Z"),
        }),
        activity({
          id: "same-dist-same-dur-later",
          discipline: "BIKE",
          distanceMeters: 50_000,
          durationSeconds: 7800,
          startTime: new Date("2026-07-03T08:00:00.000Z"),
        }),
      ],
      "BIKE"
    );
    assert.equal(longest?.id, "same-dist-same-dur-later");
  });

  it("returns null when no matching activities", () => {
    assert.equal(
      computeLongestByDistance(
        [activity({ id: "a", discipline: "SWIM", distanceMeters: 2000 })],
        "RUN"
      ),
      null
    );
  });

  it("uses athlete-local date from utc offset", () => {
    const longest = computeLongestByDistance(
      [
        activity({
          id: "local",
          discipline: "RUN",
          distanceMeters: 12_000,
          // 2026-07-01 23:00 UTC + 3h => 2026-07-02 local
          startTime: new Date("2026-07-01T23:00:00.000Z"),
          utcOffsetSeconds: 3 * 3600,
        }),
      ],
      "RUN"
    );
    assert.equal(longest?.date, "2026-07-02");
  });
});
