import type { Discipline } from "@prisma/client";
import { isBefore, parseISO, startOfDay } from "date-fns";
import type { CalendarLinkedActivity, CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { totalZoneMinutes } from "@/lib/workout/steps";

export type WorkoutShadingMode =
  | "OFF"
  | "DURATION"
  | "ELAPSED_DURATION"
  | "MOVING_DURATION"
  | "DISTANCE"
  | "TIZ";

export type WorkoutShadingTone = "gray" | "green" | "amber" | "red";

export type WorkoutShadingSettings = Record<Discipline, WorkoutShadingMode>;

export const DEFAULT_WORKOUT_SHADING: WorkoutShadingSettings = {
  BIKE: "OFF",
  RUN: "OFF",
  SWIM: "OFF",
  STRENGTH: "OFF",
};

const PAST_GRAY_CARD_CLASS =
  "rounded-md border border-zinc-300 bg-zinc-100 p-2 text-sm shadow-sm dark:border-zinc-600 dark:bg-zinc-800/80";

const TONE_CARD_CLASSES: Record<Exclude<WorkoutShadingTone, "gray">, string> = {
  green:
    "rounded-md border border-emerald-400 bg-emerald-50 p-2 text-sm shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40",
  amber:
    "rounded-md border border-amber-400 bg-amber-50 p-2 text-sm shadow-sm dark:border-amber-700 dark:bg-amber-950/40",
  red: "rounded-md border border-red-400 bg-red-50 p-2 text-sm shadow-sm dark:border-red-700 dark:bg-red-950/40",
};

export function buildWorkoutShadingSettings(
  rows: Array<{ discipline: string; pastWorkoutShading?: WorkoutShadingMode | null }>,
  strengthShading?: WorkoutShadingMode | null
): WorkoutShadingSettings {
  const result = { ...DEFAULT_WORKOUT_SHADING };
  for (const row of rows) {
    if (
      row.discipline !== "BIKE" &&
      row.discipline !== "RUN" &&
      row.discipline !== "SWIM" &&
      row.discipline !== "STRENGTH"
    ) {
      continue;
    }
    const discipline = row.discipline as Discipline;
    if (discipline === "STRENGTH") continue;
    if (row.pastWorkoutShading) {
      result[discipline] = row.pastWorkoutShading;
    }
  }
  if (strengthShading) {
    result.STRENGTH = strengthShading;
  }
  return result;
}

export function isValidWorkoutShadingMode(
  discipline: Discipline,
  mode: WorkoutShadingMode
): boolean {
  if (mode === "OFF") return true;
  if (discipline === "STRENGTH") return mode === "DURATION";
  if (discipline === "SWIM") {
    return (
      mode === "ELAPSED_DURATION" ||
      mode === "MOVING_DURATION" ||
      mode === "DISTANCE" ||
      mode === "TIZ"
    );
  }
  return mode === "DURATION" || mode === "DISTANCE" || mode === "TIZ";
}

export function workoutShadingOptionsForDiscipline(
  discipline: Discipline
): Array<{ value: WorkoutShadingMode; label: string }> {
  if (discipline === "STRENGTH") {
    return [
      { value: "OFF", label: "Off" },
      { value: "DURATION", label: "Duration" },
    ];
  }
  if (discipline === "SWIM") {
    return [
      { value: "OFF", label: "Off" },
      { value: "ELAPSED_DURATION", label: "Elapsed duration" },
      { value: "MOVING_DURATION", label: "Moving duration" },
      { value: "DISTANCE", label: "Distance" },
      { value: "TIZ", label: "TiZ" },
    ];
  }
  return [
    { value: "OFF", label: "Off" },
    { value: "DURATION", label: "Duration" },
    { value: "DISTANCE", label: "Distance" },
    { value: "TIZ", label: "TiZ" },
  ];
}

export function isPastScheduledDate(scheduledDate: string): boolean {
  const day = parseISO(`${scheduledDate}T12:00:00`);
  return isBefore(day, startOfDay(new Date()));
}

const DURATION_GREEN_WINDOW_MINUTES = 5;
const RUN_BIKE_DISTANCE_GREEN_WINDOW_METERS = 1000;
const SWIM_DISTANCE_GREEN_WINDOW_METERS = 300;

function distanceGreenWindowMeters(discipline: Discipline): number {
  return discipline === "SWIM"
    ? SWIM_DISTANCE_GREEN_WINDOW_METERS
    : RUN_BIKE_DISTANCE_GREEN_WINDOW_METERS;
}

type MetricComparisonKind = "duration" | "distance" | "tiz";

function metricKindForMode(mode: WorkoutShadingMode): MetricComparisonKind {
  switch (mode) {
    case "DURATION":
    case "ELAPSED_DURATION":
    case "MOVING_DURATION":
      return "duration";
    case "DISTANCE":
      return "distance";
    case "TIZ":
      return "tiz";
    default:
      return "tiz";
  }
}

export function metricComparisonTone(
  planned: number | null | undefined,
  completed: number | null | undefined,
  kind: MetricComparisonKind,
  discipline: Discipline
): WorkoutShadingTone {
  if (completed == null || !Number.isFinite(completed) || completed < 0) {
    return "red";
  }
  if (planned == null || !Number.isFinite(planned) || planned <= 0) {
    return completed <= 0 ? "green" : "red";
  }

  const absDiff = Math.abs(planned - completed);
  if (kind === "duration" && absDiff <= DURATION_GREEN_WINDOW_MINUTES) {
    return "green";
  }
  if (kind === "distance" && absDiff <= distanceGreenWindowMeters(discipline)) {
    return "green";
  }

  const pctDiff = absDiff / planned;
  if (pctDiff <= 0.1) return "green";
  if (pctDiff <= 0.25) return "amber";
  return "red";
}

function plannedMetricValue(
  session: CalendarPlannedSession,
  mode: WorkoutShadingMode
): number | null {
  switch (mode) {
    case "DURATION":
    case "ELAPSED_DURATION":
    case "MOVING_DURATION":
      return session.plannedMinutes > 0 ? session.plannedMinutes : null;
    case "DISTANCE":
      return session.distanceMeters != null && session.distanceMeters > 0
        ? session.distanceMeters
        : null;
    case "TIZ":
      return totalZoneMinutes(session.zoneMinutes) > 0
        ? totalZoneMinutes(session.zoneMinutes)
        : null;
    default:
      return null;
  }
}

function completedMetricValue(
  linked: CalendarLinkedActivity,
  mode: WorkoutShadingMode,
  discipline: Discipline
): number | null {
  switch (mode) {
    case "DURATION":
      if (discipline === "STRENGTH") {
        return linked.durationSeconds > 0 ? linked.durationSeconds / 60 : null;
      }
      if (linked.movingSeconds != null && linked.movingSeconds > 0) {
        return linked.movingSeconds / 60;
      }
      return linked.durationSeconds > 0 ? linked.durationSeconds / 60 : null;
    case "ELAPSED_DURATION":
      return linked.elapsedSeconds > 0 ? linked.elapsedSeconds / 60 : null;
    case "MOVING_DURATION":
      if (linked.movingSeconds != null && linked.movingSeconds > 0) {
        return linked.movingSeconds / 60;
      }
      return linked.elapsedSeconds > 0 ? linked.elapsedSeconds / 60 : null;
    case "DISTANCE":
      return linked.distanceMeters != null && linked.distanceMeters > 0
        ? linked.distanceMeters
        : null;
    case "TIZ":
      return linked.zoneMinutes > 0 ? linked.zoneMinutes : null;
    default:
      return null;
  }
}

export function resolveSessionShadingTone(
  session: CalendarPlannedSession,
  shadingSettings: WorkoutShadingSettings
): WorkoutShadingTone | null {
  if (!isPastScheduledDate(session.scheduledDate)) return null;

  const discipline = session.discipline as Discipline;
  const mode = shadingSettings[discipline] ?? "OFF";
  if (mode === "OFF") return "gray";

  if (!session.linkedActivity) return "red";

  const planned = plannedMetricValue(session, mode);
  const completed = completedMetricValue(session.linkedActivity, mode, discipline);
  return metricComparisonTone(planned, completed, metricKindForMode(mode), discipline);
}

export function sessionCardClassName(
  session: CalendarPlannedSession,
  shadingSettings: WorkoutShadingSettings
): string {
  const tone = resolveSessionShadingTone(session, shadingSettings);
  if (tone) {
    return tone === "gray" ? PAST_GRAY_CARD_CLASS : TONE_CARD_CLASSES[tone];
  }

  const anchored = session.source === "ANCHORED_INSTANCE";
  const templated = session.source === "TEMPLATE";
  if (anchored) {
    return "rounded-md border border-sky-500 bg-sky-50 p-2 text-sm shadow-sm dark:border-sky-600 dark:bg-sky-950/50";
  }
  if (templated) {
    return "rounded-md border border-violet-400 bg-violet-50/80 p-2 text-sm shadow-sm dark:border-violet-700 dark:bg-violet-950/30";
  }
  return "rounded-md border border-dashed border-sky-400 bg-sky-50/80 p-2 text-sm shadow-sm dark:border-sky-700 dark:bg-sky-950/30";
}
