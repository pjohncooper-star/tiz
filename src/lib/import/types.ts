import type { NormalizedStreams } from "@/lib/zones/compute";
import type { FitSessionSelfEval } from "@/lib/survey/fit-self-eval";

export type ActivityLegType = "SWIM" | "BIKE" | "RUN" | "TRANSITION";

export type ParsedActivity = {
  externalId?: string;
  name: string;
  discipline: "BIKE" | "RUN" | "SWIM";
  startTime: Date;
  durationSeconds: number;
  distanceMeters?: number;
  streams: NormalizedStreams;
  selfEval?: FitSessionSelfEval;
  isPrOrAchievement?: boolean;
  multisportGroupId?: string;
  sessionIndex?: number;
  legType?: ActivityLegType;
};

export function emptyStreams(): NormalizedStreams {
  return {};
}

export function mergeStreams(
  a: NormalizedStreams,
  b: NormalizedStreams
): NormalizedStreams {
  return {
    time: a.time ?? b.time,
    velocityTime: a.velocityTime ?? b.velocityTime,
    watts: a.watts ?? b.watts,
    heartrate: a.heartrate ?? b.heartrate,
    velocity: a.velocity ?? b.velocity,
    distance: a.distance ?? b.distance,
    cadence: a.cadence ?? b.cadence,
  };
}
