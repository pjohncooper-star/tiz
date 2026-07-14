import type { ActivityLegType, Discipline, SignalType } from "@prisma/client";
import type { SwimLapPoint } from "@/lib/import/swim-laps";
import { velocityToPaceSecPer100m, velocityToPaceSecPerKm } from "@/lib/units/pace";
import { resolveSampleDurations } from "@/lib/zones/sample-time";
import { assignEcoZone, ecoBoundariesForSignal } from "./boundaries";
import {
  ECO_ZONE_COUNT,
  ECO_TRANSITION_BUMPS,
  ecoDisciplineFactor,
  weightedEcoFromZoneMinutes,
} from "./scores";

type StreamSeries = { data: number[] };

/** Minimal stream shape for ECO (compatible with NormalizedStreams). */
export type EcoStreams = {
  time?: StreamSeries;
  velocityTime?: StreamSeries;
  swimLaps?: { data: SwimLapPoint[] };
  watts?: StreamSeries;
  heartrate?: StreamSeries;
  velocity?: StreamSeries;
};

export type EcoZoneMinutes = Record<number, number>;

export type EcoComputeResult = {
  ecos: number;
  ecoZoneMinutes: EcoZoneMinutes;
  signalUsed: SignalType;
  disciplineFactor: number;
  transitionBump: number;
};

const USABILITY = 0.8;

function usable(data: number[] | undefined, min = 10): boolean {
  if (!data || data.length < min) return false;
  const valid = data.filter((v) => v != null && !Number.isNaN(v) && v > 0).length;
  return valid / data.length >= USABILITY;
}

function isStreamUsable(streams: EcoStreams, signal: SignalType): boolean {
  if (signal === "POWER") return usable(streams.watts?.data);
  if (signal === "HEART_RATE") return usable(streams.heartrate?.data);
  if (signal === "PACE" && streams.swimLaps?.data?.length) {
    const active = streams.swimLaps.data.filter((l) => l.speedMps > 0);
    return active.length >= 3;
  }
  return usable(streams.velocity?.data);
}

function emptyEcoZones(): EcoZoneMinutes {
  const zones: EcoZoneMinutes = {};
  for (let z = 1; z <= ECO_ZONE_COUNT; z++) zones[z] = 0;
  return zones;
}

function sampleValue(
  streams: EcoStreams,
  signal: SignalType,
  discipline: Discipline,
  i: number
): number | null {
  if (signal === "POWER") {
    const v = streams.watts?.data[i];
    return v != null && v > 0 ? v : null;
  }
  if (signal === "HEART_RATE") {
    const v = streams.heartrate?.data[i];
    return v != null && v > 0 ? v : null;
  }
  const vel = streams.velocity?.data[i];
  if (vel == null || vel <= 0) return null;
  return discipline === "SWIM"
    ? velocityToPaceSecPer100m(vel)
    : velocityToPaceSecPerKm(vel);
}

/**
 * Transition bump for multisport second (or later) legs per ECO method.
 * Swim→bike: +0.10 on bike factor; bike→run: +0.15 on run factor.
 */
export function ecoTransitionBump(input: {
  discipline: Discipline;
  legType?: ActivityLegType | null;
  priorLegTypes?: ActivityLegType[];
}): number {
  const prior = input.priorLegTypes ?? [];
  if (prior.length === 0) return 0;

  const isBike = input.discipline === "BIKE" || input.legType === "BIKE";
  const isRun = input.discipline === "RUN" || input.legType === "RUN";

  if (isBike && prior.includes("SWIM")) {
    return ECO_TRANSITION_BUMPS.swimToBike;
  }
  if (isRun && prior.includes("BIKE")) {
    return ECO_TRANSITION_BUMPS.bikeToRun;
  }
  return 0;
}

export function computeEcoZoneMinutes(
  streams: EcoStreams,
  signal: SignalType,
  thresholdValue: number,
  discipline: Discipline,
  durationSeconds?: number
): EcoZoneMinutes {
  const boundaries = ecoBoundariesForSignal(signal);
  const length = Math.max(
    signal === "POWER"
      ? (streams.watts?.data.length ?? 0)
      : signal === "HEART_RATE"
        ? (streams.heartrate?.data.length ?? 0)
        : (streams.velocity?.data.length ?? 0),
    streams.time?.data.length ?? 0,
    streams.velocityTime?.data.length ?? 0
  );

  const sampleDurations = resolveSampleDurations(streams, durationSeconds, signal);
  const zoneMinutes = emptyEcoZones();

  for (let i = 0; i < length; i++) {
    const value = sampleValue(streams, signal, discipline, i);
    if (value == null) continue;
    const zone = assignEcoZone(value, thresholdValue, boundaries, signal);
    const dt = sampleDurations[i] ?? 1;
    zoneMinutes[zone] = (zoneMinutes[zone] ?? 0) + dt / 60;
  }

  if (
    discipline === "SWIM" &&
    signal === "PACE" &&
    streams.swimLaps?.data?.length
  ) {
    for (const lap of streams.swimLaps.data) {
      if (lap.speedMps <= 0 && lap.durationSec > 0) {
        zoneMinutes[1] = (zoneMinutes[1] ?? 0) + lap.durationSec / 60;
      }
    }
  }

  return zoneMinutes;
}

export function computeSessionEcos(input: {
  streams: EcoStreams;
  signal: SignalType;
  thresholdValue: number;
  discipline: Discipline;
  durationSeconds?: number;
  transitionBump?: number;
}): EcoComputeResult | null {
  const factor = ecoDisciplineFactor(input.discipline, input.transitionBump ?? 0);
  if (factor == null) return null;
  if (!isStreamUsable(input.streams, input.signal)) return null;

  const ecoZoneMinutes = computeEcoZoneMinutes(
    input.streams,
    input.signal,
    input.thresholdValue,
    input.discipline,
    input.durationSeconds
  );

  const ecos = weightedEcoFromZoneMinutes(ecoZoneMinutes, factor);
  return {
    ecos,
    ecoZoneMinutes,
    signalUsed: input.signal,
    disciplineFactor: factor,
    transitionBump: input.transitionBump ?? 0,
  };
}

/** Pure helper for flat-zone session examples from the literature. */
export function ecosForFlatSession(
  minutes: number,
  ecoZone: number,
  discipline: Discipline,
  transitionBump = 0
): number | null {
  const factor = ecoDisciplineFactor(discipline, transitionBump);
  if (factor == null) return null;
  const zoneMinutes = emptyEcoZones();
  zoneMinutes[ecoZone] = minutes;
  return weightedEcoFromZoneMinutes(zoneMinutes, factor);
}
