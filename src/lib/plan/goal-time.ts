import { formatDurationHms, parseDurationInput } from "@/lib/workout/workout-tree";

export const GOAL_TIME_PLACEHOLDER = "mm:ss or minutes";

function formatGoalTimeFromMinutes(minutes: number): string {
  if (minutes < 60) {
    const wholeMinutes = Math.floor(minutes);
    const seconds = Math.round((minutes - wholeMinutes) * 60);
    if (seconds > 0) {
      return `${wholeMinutes}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${wholeMinutes}:00`;
  }
  return formatDurationHms(minutes * 60);
}

/** Format stored minutes for editor display (e.g. 10 → "10:00", 90 → "1:30:00"). */
export function formatGoalTimeInput(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  return formatGoalTimeFromMinutes(minutes);
}

/** Parse mm:ss, hh:mm:ss, or plain minutes to whole minutes for storage. */
export function parseGoalTimeInput(value: string): number | null {
  const seconds = parseDurationInput(value);
  if (seconds == null || seconds <= 0) return null;
  return Math.round(seconds / 60);
}

/** Format stored minutes for read-only display. */
export function formatGoalTimeDisplay(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  return formatGoalTimeFromMinutes(minutes);
}
