import type { GoalEventDiscipline } from "@prisma/client";
import type { Discipline } from "@/components/season/season-settings-types";

export type DisciplineGoalMinutes = {
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
};

export type GoalEventTimeFields = DisciplineGoalMinutes & {
  disciplines: Discipline[];
  estimatedDurationMinutes?: number | null;
};

const DISCIPLINE_GOAL_KEY: Record<
  Discipline,
  keyof DisciplineGoalMinutes
> = {
  SWIM: "swimGoalMinutes",
  BIKE: "bikeGoalMinutes",
  RUN: "runGoalMinutes",
};

export function goalMinutesForDiscipline(
  event: DisciplineGoalMinutes,
  discipline: Discipline | GoalEventDiscipline
): number | null {
  switch (discipline) {
    case "SWIM":
      return event.swimGoalMinutes ?? null;
    case "BIKE":
      return event.bikeGoalMinutes ?? null;
    case "RUN":
      return event.runGoalMinutes ?? null;
    default:
      return null;
  }
}

export function sumDisciplineGoalMinutes(
  disciplines: Discipline[],
  times: DisciplineGoalMinutes
): number | null {
  if (disciplines.length === 0) return null;
  let total = 0;
  for (const discipline of disciplines) {
    const minutes = goalMinutesForDiscipline(times, discipline);
    if (minutes == null || minutes <= 0) return null;
    total += minutes;
  }
  return total;
}

/** Resolve stored total: explicit total, or sum of per-leg times when all legs filled. */
export function resolveEstimatedDurationMinutes(
  event: GoalEventTimeFields
): number | null {
  const sum = sumDisciplineGoalMinutes(event.disciplines, event);
  if (sum != null) return sum;
  if (event.estimatedDurationMinutes != null && event.estimatedDurationMinutes > 0) {
    return event.estimatedDurationMinutes;
  }
  return null;
}

export function goalEventTimesForApi(event: GoalEventTimeFields): DisciplineGoalMinutes & {
  estimatedDurationMinutes: number | null;
} {
  if (event.disciplines.length === 1) {
    const discipline = event.disciplines[0]!;
    const legMinutes = goalMinutesForDiscipline(event, discipline);
    const estimated =
      event.estimatedDurationMinutes ?? legMinutes ?? null;
    return {
      ...singleDisciplineGoalMinutes(discipline, estimated),
      estimatedDurationMinutes: estimated,
    };
  }

  const swimGoalMinutes = event.swimGoalMinutes ?? null;
  const bikeGoalMinutes = event.bikeGoalMinutes ?? null;
  const runGoalMinutes = event.runGoalMinutes ?? null;
  return {
    swimGoalMinutes,
    bikeGoalMinutes,
    runGoalMinutes,
    estimatedDurationMinutes: resolveEstimatedDurationMinutes({
      disciplines: event.disciplines,
      swimGoalMinutes,
      bikeGoalMinutes,
      runGoalMinutes,
      estimatedDurationMinutes: event.estimatedDurationMinutes ?? null,
    }),
  };
}

export function singleDisciplineGoalMinutes(
  discipline: Discipline,
  estimatedDurationMinutes: number | null | undefined
): DisciplineGoalMinutes {
  const minutes = estimatedDurationMinutes ?? null;
  return {
    swimGoalMinutes: discipline === "SWIM" ? minutes : null,
    bikeGoalMinutes: discipline === "BIKE" ? minutes : null,
    runGoalMinutes: discipline === "RUN" ? minutes : null,
  };
}

export function formatDisciplineGoalTimesSummary(
  disciplines: Discipline[],
  times: DisciplineGoalMinutes
): string | null {
  const parts = disciplines
    .map((d) => {
      const minutes = goalMinutesForDiscipline(times, d);
      if (minutes == null || minutes <= 0) return null;
      const label = d === "SWIM" ? "Swim" : d === "BIKE" ? "Bike" : "Run";
      return `${label} ${formatMinutesShort(minutes)}`;
    })
    .filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatMinutesShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function hasPartialDisciplineGoalTimes(event: GoalEventTimeFields): boolean {
  const filled = event.disciplines.filter((d) => {
    const m = goalMinutesForDiscipline(event, d);
    return m != null && m > 0;
  });
  return filled.length > 0 && filled.length < event.disciplines.length;
}

export function setDisciplineGoalMinutes(
  event: DisciplineGoalMinutes,
  discipline: Discipline,
  minutes: number | null
): DisciplineGoalMinutes {
  const key = DISCIPLINE_GOAL_KEY[discipline];
  return { ...event, [key]: minutes };
}
