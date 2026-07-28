import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveActivityNumericMetrics } from "@/lib/activity/summary";
import type { NormalizedStreams } from "@/lib/zones/compute";

describe("resolveActivityNumericMetrics", () => {
  it("uses meta.elapsedSeconds when present", () => {
    const streams: NormalizedStreams = {
      meta: { elapsedSeconds: 3900, movingSeconds: 3174 },
    };
    const metrics = resolveActivityNumericMetrics(3174, 3500, streams);
    assert.equal(metrics.elapsedSeconds, 3900);
    assert.equal(metrics.movingSeconds, 3174);
  });

  it("recovers swim elapsed from active + rest laps when meta is missing", () => {
    // Legacy Strava: durationSeconds stored as moving_time only.
    const streams: NormalizedStreams = {
      swimLaps: {
        data: [
          { startSec: 0, durationSec: 1800, speedMps: 1.2 },
          { startSec: 1800, durationSec: 720, speedMps: 0 },
          { startSec: 2520, durationSec: 1374, speedMps: 1.1 },
        ],
      },
    };
    const metrics = resolveActivityNumericMetrics(3174, 3500, streams);
    assert.equal(metrics.elapsedSeconds, 1800 + 720 + 1374);
    assert.equal(metrics.movingSeconds, 1800 + 1374);
  });
});
