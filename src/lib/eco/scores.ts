import type { Discipline } from "@prisma/client";

/** ECO zone labels (Cejuela-Anta & Esteve-Lanao, 2011). */
export const ECO_ZONE_LABELS = [
  "<AeT",
  "AeT",
  "AeT–AnT",
  "AnT",
  ">AnT",
  "MAP",
  "LAC Cap",
  "LAC Pow",
] as const;

export const ECO_ZONE_COUNT = 8;

/** Zone scores for ECO zones 1–8. */
export const ECO_ZONE_SCORES = [1, 2, 3, 4, 6, 9, 15, 50] as const;

/** Discipline relative factors (running = 1). */
export const ECO_DISCIPLINE_FACTORS: Record<
  Extract<Discipline, "BIKE" | "RUN" | "SWIM">,
  number
> = {
  RUN: 1.0,
  SWIM: 0.75,
  BIKE: 0.5,
};

/** Transition bump applied to the second event's discipline factor. */
export const ECO_TRANSITION_BUMPS = {
  swimToBike: 0.1,
  bikeToRun: 0.15,
} as const;

export function ecoZoneScore(zone: number): number {
  if (zone < 1 || zone > ECO_ZONE_COUNT) return 0;
  return ECO_ZONE_SCORES[zone - 1]!;
}

export function ecoDisciplineFactor(
  discipline: Discipline,
  transitionBump = 0
): number | null {
  if (discipline === "BIKE" || discipline === "RUN" || discipline === "SWIM") {
    return ECO_DISCIPLINE_FACTORS[discipline] + transitionBump;
  }
  return null;
}

export function weightedEcoFromZoneMinutes(
  zoneMinutes: Record<number, number>,
  disciplineFactor: number
): number {
  let sum = 0;
  for (let z = 1; z <= ECO_ZONE_COUNT; z++) {
    sum += (zoneMinutes[z] ?? 0) * ecoZoneScore(z);
  }
  return sum * disciplineFactor;
}
