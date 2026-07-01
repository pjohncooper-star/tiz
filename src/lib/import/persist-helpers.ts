import type { FitSessionSelfEval } from "@/lib/survey/fit-self-eval";
import type { NormalizedStreams } from "@/lib/zones/compute";

export function mergeSelfEvalIntoRawStreams(
  rawStreams: unknown,
  selfEval?: FitSessionSelfEval
): NormalizedStreams {
  const streams = (rawStreams ?? {}) as NormalizedStreams;
  if (!selfEval) return streams;

  const meta = { ...(streams.meta ?? {}) };
  if (selfEval.workoutFeel != null && selfEval.workoutFeel >= 0) {
    meta.workoutFeel = selfEval.workoutFeel;
  }
  if (selfEval.workoutRpeRaw != null && selfEval.workoutRpeRaw > 0) {
    meta.workoutRpe = selfEval.workoutRpeRaw;
  }

  return { ...streams, meta };
}

function seriesHasData(series: { data?: unknown[] } | undefined): boolean {
  return !!series?.data?.length;
}

/** Prefer newly imported stream series when present; keep existing otherwise. */
export function mergeActivityStreams(
  existing: unknown,
  incoming: NormalizedStreams
): NormalizedStreams {
  const prev = (existing ?? {}) as NormalizedStreams;
  const pick = <T extends { data: unknown[] } | undefined>(
    next: T | undefined,
    prior: T | undefined
  ): T | undefined => (seriesHasData(next) ? next : prior);

  return {
    ...prev,
    ...incoming,
    time: pick(incoming.time, prev.time),
    watts: pick(incoming.watts, prev.watts),
    heartrate: pick(incoming.heartrate, prev.heartrate),
    velocity: pick(incoming.velocity, prev.velocity),
    cadence: pick(incoming.cadence, prev.cadence),
    distance: pick(incoming.distance, prev.distance),
    velocityTime: pick(incoming.velocityTime, prev.velocityTime),
    swimLaps: pick(incoming.swimLaps, prev.swimLaps),
    workoutLaps: pick(incoming.workoutLaps, prev.workoutLaps),
    meta: { ...prev.meta, ...incoming.meta },
  };
}

export function incomingHasStreamData(streams: NormalizedStreams): boolean {
  return (
    seriesHasData(streams.time) ||
    seriesHasData(streams.watts) ||
    seriesHasData(streams.heartrate) ||
    seriesHasData(streams.velocity) ||
    seriesHasData(streams.cadence) ||
    seriesHasData(streams.distance) ||
    seriesHasData(streams.workoutLaps) ||
    seriesHasData(streams.swimLaps)
  );
}
