import type { Discipline } from "@prisma/client";

export const DISCIPLINE_DISPLAY_LABELS: Record<Discipline, string> = {
  BIKE: "Bike",
  RUN: "Run",
  SWIM: "Swim",
  STRENGTH: "Strength",
};

export const ENDURANCE_DISCIPLINES: Discipline[] = ["BIKE", "RUN", "SWIM"];

export function isEnduranceDiscipline(discipline: Discipline): boolean {
  return discipline !== "STRENGTH";
}
