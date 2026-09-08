import type { Discipline } from "@prisma/client";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { DEFAULT_ZONE_COUNT } from "@/lib/zones/boundaries";
import type { FlattenPlanningOptions } from "@/lib/workout/workout-tree";
import type { RacePaceAnchors } from "@/lib/workout/relative-pace";

export type DisciplinePaceContext = {
  thresholdPaceSeconds: number | null;
  zoneBoundaries: number[];
  /** Bike FTP for absolute watt → zone mapping (BIKE only). */
  thresholdFtpWatts?: number | null;
  powerZoneBoundaries?: number[];
};

export type PaceThresholdContext = Partial<
  Record<"RUN" | "SWIM" | "BIKE", DisciplinePaceContext>
> & {
  /** Athlete race-pace anchors for relative pace step targets. */
  racePaces?: RacePaceAnchors | null;
};

export function flattenOptionsForDiscipline(
  discipline: Discipline,
  paceContext?: PaceThresholdContext | null
): FlattenPlanningOptions {
  if (discipline === "RUN" || discipline === "SWIM") {
    const ctx = paceContext?.[discipline];
    return {
      discipline,
      thresholdPaceSeconds: ctx?.thresholdPaceSeconds ?? null,
      zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor(discipline, "PACE"),
      zoneCount: DEFAULT_ZONE_COUNT,
      racePaces: paceContext?.racePaces ?? null,
    };
  }
  if (discipline === "BIKE") {
    const ctx = paceContext?.BIKE;
    return {
      zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor("BIKE", "PACE"),
      thresholdFtpWatts: ctx?.thresholdFtpWatts ?? null,
      powerZoneBoundaries:
        ctx?.powerZoneBoundaries ?? zoneBoundariesFor("BIKE", "POWER"),
      // Week TiZ is always Z1–Z5 even if the athlete's POWER profile uses 7 zones.
      zoneCount: DEFAULT_ZONE_COUNT,
    };
  }
  return { zoneCount: DEFAULT_ZONE_COUNT };
}

/** BIKE PACE threshold is stored as sec/km; convert to m/s for distance derivation. */
export function bikeThresholdSpeedMps(
  paceContext?: PaceThresholdContext | null
): number | null {
  const thresholdPaceSeconds = paceContext?.BIKE?.thresholdPaceSeconds;
  if (thresholdPaceSeconds == null || !(thresholdPaceSeconds > 0)) return null;
  return 1000 / thresholdPaceSeconds;
}
