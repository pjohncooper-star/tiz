import type { PhaseKind } from "@prisma/client";
import { DEFAULT_DISCIPLINE_SPLIT } from "./constants";
import { roundHours } from "./volume-curve";

export type DisciplineHours = {
  swimHours: number;
  bikeHours: number;
  runHours: number;
};

export function splitHoursByDiscipline(
  totalHours: number,
  phaseKind: PhaseKind
): DisciplineHours {
  const split = DEFAULT_DISCIPLINE_SPLIT[phaseKind];
  const swimHours = roundHours((totalHours * split.swim) / 100);
  const bikeHours = roundHours((totalHours * split.bike) / 100);
  const runHours = roundHours(totalHours - swimHours - bikeHours);
  return { swimHours, bikeHours, runHours };
}

export function splitWeeklyHoursByPhase(
  weeklyHours: number[],
  phaseKindsByWeek: PhaseKind[]
): DisciplineHours[] {
  return weeklyHours.map((hours, i) =>
    splitHoursByDiscipline(hours, phaseKindsByWeek[i] ?? "BUILD")
  );
}
