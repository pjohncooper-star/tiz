import { formatDurationHms, parseDurationInput } from "@/lib/workout/workout-tree";

export const GOAL_TIME_PLACEHOLDER = "hh:mm:ss";

/** Format stored minutes as H:MM:SS for editor display. */
export function formatGoalTimeInput(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  return formatDurationHms(minutes * 60);
}

/** Parse hh:mm:ss (or mm:ss) input to whole minutes for storage. */
export function parseGoalTimeInput(value: string): number | null {
  const seconds = parseDurationInput(value);
  if (seconds == null || seconds <= 0) return null;
  return Math.round(seconds / 60);
}

/** Format stored minutes as H:MM:SS for read-only display. */
export function formatGoalTimeDisplay(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  return formatDurationHms(minutes * 60);
}
