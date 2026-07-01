import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeActivityStreams } from "@/lib/import/persist-helpers";
import type { NormalizedStreams } from "@/lib/zones/compute";

describe("mergeActivityStreams", () => {
  it("replaces empty existing series with incoming stream data", () => {
    const existing: NormalizedStreams = {
      meta: { avgPower: 200 },
    };
    const incoming: NormalizedStreams = {
      time: { data: [0, 1, 2] },
      watts: { data: [180, 190, 200] },
      workoutLaps: {
        data: [
          {
            elapsedSeconds: 60,
            avgPower: 190,
            wktStepIndex: 0,
          },
        ],
      },
    };

    const merged = mergeActivityStreams(existing, incoming);
    assert.deepEqual(merged.time?.data, [0, 1, 2]);
    assert.deepEqual(merged.watts?.data, [180, 190, 200]);
    assert.equal(merged.workoutLaps?.data?.length, 1);
    assert.equal(merged.meta?.avgPower, 200);
  });

  it("keeps existing series when incoming has no data for that series", () => {
    const existing: NormalizedStreams = {
      time: { data: [0, 10, 20] },
      watts: { data: [150, 160, 170] },
    };
    const incoming: NormalizedStreams = {
      workoutLaps: {
        data: [
          {
            elapsedSeconds: 120,
            avgPower: 165,
            wktStepIndex: 1,
          },
        ],
      },
    };

    const merged = mergeActivityStreams(existing, incoming);
    assert.deepEqual(merged.time?.data, [0, 10, 20]);
    assert.deepEqual(merged.watts?.data, [150, 160, 170]);
    assert.equal(merged.workoutLaps?.data?.length, 1);
  });
});
