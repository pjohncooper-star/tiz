import type { NormalizedStreams } from "@/lib/zones/compute";
import type { SwimLapPoint } from "@/lib/import/swim-laps";
import { velocityToPaceSecPer100m } from "@/lib/units/pace";

export type SwimLapInterval = {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  paceSecPer100m: number | null;
  isRest: boolean;
};

export function parseSwimLapIntervals(
  streams: NormalizedStreams | null | undefined
): SwimLapInterval[] | null {
  const laps = streams?.swimLaps?.data;
  if (!laps?.length) return null;

  const intervals: SwimLapInterval[] = [];
  for (const lap of laps) {
    if (lap.durationSec <= 0) continue;
    const isRest = lap.speedMps <= 0;
    intervals.push({
      index: intervals.length + 1,
      startSec: lap.startSec,
      endSec: lap.startSec + lap.durationSec,
      durationSec: lap.durationSec,
      paceSecPer100m: isRest ? null : velocityToPaceSecPer100m(lap.speedMps),
      isRest,
    });
  }

  return intervals.length > 0 ? intervals : null;
}

export function hasSwimLapIntervals(
  streams: NormalizedStreams | null | undefined
): boolean {
  return parseSwimLapIntervals(streams) != null;
}
