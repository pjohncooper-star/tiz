import type { Discipline, SignalType } from "@prisma/client";
import {
  zoneBoundariesFor,
  type ZoneBoundaryKey,
  DEFAULT_ZONE_BOUNDARIES_BY_KEY,
} from "@/lib/zones/boundaries";

/** @deprecated Use zoneBoundariesFor(discipline, signalType). */
export const DEFAULT_ZONE_BOUNDARIES: Record<SignalType, number[]> = {
  POWER: zoneBoundariesFor("BIKE", "POWER"),
  HEART_RATE: zoneBoundariesFor("BIKE", "HEART_RATE"),
  PACE: zoneBoundariesFor("RUN", "PACE"),
};

export { zoneBoundariesFor, DEFAULT_ZONE_BOUNDARIES_BY_KEY };
export type { ZoneBoundaryKey };

export const DEFAULT_DISCIPLINE_SIGNALS: Record<
  Discipline,
  { primary: SignalType; fallback: SignalType | null }
> = {
  BIKE: { primary: "POWER", fallback: "HEART_RATE" },
  RUN: { primary: "PACE", fallback: "HEART_RATE" },
  SWIM: { primary: "PACE", fallback: null },
  STRENGTH: { primary: "HEART_RATE", fallback: null },
};

export function getDefaultThreshold(
  discipline: Discipline,
  signalType: SignalType
): number {
  if (signalType === "POWER") return 200;
  if (signalType === "HEART_RATE") return discipline === "BIKE" ? 165 : 170;
  if (discipline === "SWIM") return 120;
  return 300;
}
