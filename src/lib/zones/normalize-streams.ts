import type { NormalizedStreams } from "./compute";
import { buildPoolSwimLapPaceStreams } from "@/lib/import/swim-laps";
import {
  deriveVelocityFromDistance,
  looksLikeCumulativeDistance,
} from "./sample-time";

/** Normalize streams from any import source before zone computation. */
export function normalizeStreamsForZones(
  streams: NormalizedStreams,
  durationSeconds?: number
): NormalizedStreams {
  const length = Math.max(
    streams.time?.data.length ?? 0,
    streams.watts?.data.length ?? 0,
    streams.heartrate?.data.length ?? 0,
    streams.velocity?.data.length ?? 0
  );
  if (length === 0 && !streams.swimLaps?.data?.length) return streams;

  const out: NormalizedStreams = { ...streams };
  const time = streams.time?.data;

  // Pool swim pace zones use lap-average speed, not per-length samples.
  if (streams.swimLaps?.data?.length) {
    const lapPace = buildPoolSwimLapPaceStreams(streams.swimLaps.data);
    if (lapPace) {
      out.velocity = lapPace.velocity;
      out.velocityTime = lapPace.velocityTime;
    }
  }

  const streamLength = Math.max(
    out.time?.data.length ?? 0,
    out.watts?.data.length ?? 0,
    out.heartrate?.data.length ?? 0,
    out.velocity?.data.length ?? 0
  );
  if (streamLength === 0) return out;

  // Index-based time (legacy FIT imports) → spread across activity duration.
  if (
    time &&
    time.length >= streamLength &&
    time.every((t, i) => t === i) &&
    durationSeconds &&
    durationSeconds > 0
  ) {
    const dt = durationSeconds / streamLength;
    out.time = { data: Array.from({ length: streamLength }, (_, i) => i * dt) };
  }

  const velocity = out.velocity?.data;
  const elapsed = out.time?.data;
  if (
    velocity &&
    velocity.length >= streamLength &&
    elapsed &&
    elapsed.length >= streamLength &&
    looksLikeCumulativeDistance(velocity)
  ) {
    out.velocity = {
      data: deriveVelocityFromDistance(
        velocity.slice(0, streamLength),
        elapsed.slice(0, streamLength)
      ),
    };
  }

  return out;
}
