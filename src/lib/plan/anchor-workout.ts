import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";

export const WORKOUT_TYPE_LABELS = {
  SWIM: DISCIPLINE_DISPLAY_LABELS.SWIM,
  BIKE: DISCIPLINE_DISPLAY_LABELS.BIKE,
  RUN: DISCIPLINE_DISPLAY_LABELS.RUN,
  STRENGTH: DISCIPLINE_DISPLAY_LABELS.STRENGTH,
} as const;

export type WorkoutType = keyof typeof WORKOUT_TYPE_LABELS;

export const WORKOUT_TYPES: WorkoutType[] = ["SWIM", "BIKE", "RUN", "STRENGTH"];

export function workoutTypeLabel(type: string): string {
  return WORKOUT_TYPE_LABELS[type as WorkoutType] ?? type;
}
