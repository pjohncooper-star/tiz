export const DISCIPLINE_LABELS = {
  BIKE: "Bike",
  RUN: "Run",
  SWIM: "Swim",
} as const;

export type PlanDiscipline = keyof typeof DISCIPLINE_LABELS;

export function defaultSessionTitle(discipline: PlanDiscipline): string {
  return DISCIPLINE_LABELS[discipline];
}

export function titleMatchesSportDefault(
  title: string,
  discipline: PlanDiscipline
): boolean {
  const trimmed = title.trim();
  return trimmed === "" || trimmed === defaultSessionTitle(discipline);
}
