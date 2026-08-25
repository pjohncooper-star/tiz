import { mondayWeekStartKey } from "@/lib/dates";
import { parseIcsCalendarName, parseIcsEvents } from "./ics";
import {
  durationMinutesFromTssIf,
  inferTrainerRoadSessionRole,
  parseTrainerRoadDurationMinutes,
  parseTrainerRoadIntensityFactor,
  parseTrainerRoadTss,
  trainerRoadTitleWithoutDuration,
} from "./intensity";
import {
  isTrainerRoadPhaseMarker,
  type TrainerRoadPhaseMarker,
} from "./phases";
import type { SessionRole } from "@prisma/client";

export type TrainerRoadWorkout = {
  uid: string;
  dateKey: string;
  title: string;
  durationMinutes: number | null;
  tss: number | null;
  intensityFactor: number | null;
  sessionRole: SessionRole | null;
  description: string;
};

export type ParsedTrainerRoadCalendar = {
  calendarName: string | null;
  workouts: TrainerRoadWorkout[];
  phaseMarkers: TrainerRoadPhaseMarker[];
};

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function dedupeTrainerRoadWorkouts(workouts: TrainerRoadWorkout[]): TrainerRoadWorkout[] {
  const best = new Map<string, TrainerRoadWorkout>();
  for (const workout of workouts) {
    const key = `${workout.dateKey}:${normalizeTitleKey(workout.title)}`;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, workout);
      continue;
    }
    const score = (row: TrainerRoadWorkout) =>
      (row.intensityFactor != null ? 4 : 0) +
      (row.tss != null ? 2 : 0) +
      (row.description.length > 0 ? 1 : 0);
    if (score(workout) > score(existing)) best.set(key, workout);
  }
  return [...best.values()].sort((a, b) => {
    const byDate = a.dateKey.localeCompare(b.dateKey);
    if (byDate !== 0) return byDate;
    return a.title.localeCompare(b.title);
  });
}

export function parseTrainerRoadCalendar(ics: string): ParsedTrainerRoadCalendar {
  const workouts: TrainerRoadWorkout[] = [];
  const phaseMarkers: TrainerRoadPhaseMarker[] = [];

  for (const event of parseIcsEvents(ics)) {
    const durationFromSummary = parseTrainerRoadDurationMinutes(event.summary);
    if (durationFromSummary == null) {
      if (isTrainerRoadPhaseMarker(event.summary)) {
        phaseMarkers.push({
          dateKey: event.dtstart,
          summary: event.summary.trim(),
          weekStartDate: mondayWeekStartKey(event.dtstart),
        });
      }
      continue;
    }

    const tss = parseTrainerRoadTss(event.description);
    const intensityFactor = parseTrainerRoadIntensityFactor(event.description);
    const durationMinutes =
      durationFromSummary ??
      (tss != null && intensityFactor != null
        ? durationMinutesFromTssIf(tss, intensityFactor)
        : null);

    workouts.push({
      uid: event.uid,
      dateKey: event.dtstart,
      title: trainerRoadTitleWithoutDuration(event.summary),
      durationMinutes,
      tss,
      intensityFactor,
      sessionRole: inferTrainerRoadSessionRole({
        intensityFactor,
        durationMinutes,
        tss,
        description: event.description,
      }),
      description: event.description,
    });
  }

  return {
    calendarName: parseIcsCalendarName(ics),
    workouts: dedupeTrainerRoadWorkouts(workouts),
    phaseMarkers,
  };
}
