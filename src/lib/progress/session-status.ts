import type { Discipline } from "@prisma/client";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { sessionCompletionRollup } from "@/lib/plan/session-completion";

/** A done session whose completed duration is below this share of planned counts as partial. */
export const PARTIAL_COMPLETION_RATIO = 0.75;

export type SessionProgressStatus = "done" | "partial" | "missed" | "upcoming";

export type PlannedSessionCompletion = {
  isDone: boolean;
  completedMinutes: number | null;
};

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Whether a planned session has been completed and for how long. A session counts as
 * done when it has a linked activity, a manual completion override, or an unlinked
 * same-day activity that was matched to it.
 */
export function resolvePlannedSessionCompletion(
  session: Pick<
    CalendarPlannedSession,
    | "discipline"
    | "linkedActivity"
    | "hasCompletedOverride"
    | "completedDurationMinutes"
    | "completedDistanceMeters"
    | "completedTargetSpeedMps"
    | "completedTargetPaceSeconds"
    | "completedZones"
  >,
  matchedExtraDurationSeconds?: number | null
): PlannedSessionCompletion {
  const completion = sessionCompletionRollup({
    discipline: session.discipline as Discipline,
    completedDurationMinutes: session.completedDurationMinutes,
    completedDistanceMeters: session.completedDistanceMeters,
    completedTargetSpeedMps: session.completedTargetSpeedMps,
    completedTargetPaceSeconds: session.completedTargetPaceSeconds,
    completedZones: session.completedZones,
  });
  const linkedMinutes =
    session.linkedActivity != null
      ? roundTenth(session.linkedActivity.durationSeconds / 60)
      : matchedExtraDurationSeconds != null
        ? roundTenth(matchedExtraDurationSeconds / 60)
        : null;
  const completedMinutes = completion?.durationMinutes ?? linkedMinutes;
  const isDone =
    session.linkedActivity != null ||
    session.hasCompletedOverride ||
    matchedExtraDurationSeconds != null ||
    completedMinutes != null;
  return { isDone, completedMinutes };
}

export function classifyPlannedSession(options: {
  dateKey: string;
  todayKey: string;
  plannedMinutes: number | null;
  completion: PlannedSessionCompletion;
}): SessionProgressStatus {
  const { completion, plannedMinutes } = options;
  if (completion.isDone) {
    if (
      plannedMinutes != null &&
      plannedMinutes > 0 &&
      completion.completedMinutes != null &&
      completion.completedMinutes > 0 &&
      completion.completedMinutes < plannedMinutes * PARTIAL_COMPLETION_RATIO
    ) {
      return "partial";
    }
    return "done";
  }
  return options.dateKey < options.todayKey ? "missed" : "upcoming";
}
