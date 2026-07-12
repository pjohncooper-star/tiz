import {
  goalMinutesForDiscipline,
  hasPartialDisciplineGoalTimes,
} from "@/lib/plan/season/goal-event-times";

export type Discipline = "SWIM" | "BIKE" | "RUN";

export type EventPriority = "A" | "B" | "C";

export type GoalEventDraft = {
  id?: string;
  plannedSessionId?: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
};

export function emptyGoalEventDraft(disciplines: Discipline[] = ["RUN"]): GoalEventDraft {
  return {
    name: "",
    date: "",
    disciplines,
    distanceMeters: null,
    estimatedDurationMinutes: null,
    swimGoalMinutes: null,
    bikeGoalMinutes: null,
    runGoalMinutes: null,
    notes: null,
  };
}

export function isGoalEventComplete(race: GoalEventDraft): boolean {
  return Boolean(race.name.trim() && race.date && race.disciplines.length > 0);
}

export function isGoalEventPartial(race: GoalEventDraft): boolean {
  const hasAny = Boolean(
    race.name.trim() ||
      race.date ||
      race.disciplines.length > 0 ||
      race.distanceMeters != null ||
      race.estimatedDurationMinutes != null ||
      race.swimGoalMinutes != null ||
      race.bikeGoalMinutes != null ||
      race.runGoalMinutes != null ||
      (race.notes?.trim() ?? "")
  );
  return hasAny && !isGoalEventComplete(race);
}

export function isGoalEventTimesPartial(race: GoalEventDraft): boolean {
  if (race.disciplines.length <= 1) return false;
  return hasPartialDisciplineGoalTimes({
    disciplines: race.disciplines,
    swimGoalMinutes: race.swimGoalMinutes,
    bikeGoalMinutes: race.bikeGoalMinutes,
    runGoalMinutes: race.runGoalMinutes,
    estimatedDurationMinutes: race.estimatedDurationMinutes,
  });
}

export function goalEventFromApi(event: {
  id?: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
}): GoalEventDraft {
  const disciplines: Discipline[] = event.disciplines?.length ? event.disciplines : ["RUN"];
  const swimGoalMinutes = event.swimGoalMinutes ?? null;
  const bikeGoalMinutes = event.bikeGoalMinutes ?? null;
  const runGoalMinutes = event.runGoalMinutes ?? null;
  let estimatedDurationMinutes = event.estimatedDurationMinutes ?? null;
  if (disciplines.length === 1) {
    const only = disciplines[0]!;
    const legMinutes = goalMinutesForDiscipline(
      { swimGoalMinutes, bikeGoalMinutes, runGoalMinutes },
      only
    );
    if (legMinutes != null) {
      estimatedDurationMinutes = legMinutes;
    }
  }
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    disciplines,
    distanceMeters: event.distanceMeters ?? null,
    estimatedDurationMinutes,
    swimGoalMinutes,
    bikeGoalMinutes,
    runGoalMinutes,
    taperDaysBefore: event.taperDaysBefore ?? null,
    notes: event.notes ?? null,
  };
}

export const DISCIPLINES: Discipline[] = ["SWIM", "BIKE", "RUN"];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  SWIM: "Swim",
  BIKE: "Bike",
  RUN: "Run",
};

const DISCIPLINE_ORDER: Discipline[] = ["SWIM", "BIKE", "RUN"];

export function sortDisciplines(disciplines: Discipline[]): Discipline[] {
  return [...disciplines].sort(
    (a, b) => DISCIPLINE_ORDER.indexOf(a) - DISCIPLINE_ORDER.indexOf(b)
  );
}

export function formatGoalDisciplines(disciplines: Discipline[]): string {
  const sorted = sortDisciplines(disciplines);
  const labels = sorted.map((d) => DISCIPLINE_LABELS[d]);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export function toggleGoalDiscipline(
  current: Discipline[],
  discipline: Discipline
): Discipline[] | null {
  if (current.includes(discipline)) {
    if (current.length === 1) return null;
    return sortDisciplines(current.filter((d) => d !== discipline));
  }
  return sortDisciplines([...current, discipline]);
}
