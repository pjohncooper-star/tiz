import type { Discipline, SignalType } from "@prisma/client";

export const DEFAULT_ZONE_BOUNDARIES: Record<SignalType, number[]> = {
  POWER: [55, 75, 90, 105, 120],
  HEART_RATE: [68, 83, 94, 100, 106],
  PACE: [90, 97, 100, 110, 120],
};

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
