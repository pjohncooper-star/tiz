import { format, parseISO } from "date-fns";
import type { Discipline } from "@prisma/client";
import { pickFirstAutoLinkCandidate } from "@/lib/plan/session-link";
import { compareSessionsForDayOrder } from "@/lib/plan/session-day-order";
import { sessionCompletionRollup } from "@/lib/plan/session-completion";
import { workoutHref, workoutHrefForResolvedActivity } from "@/lib/plan/workout-href";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";

export type DayStripSession = {
  id: string;
  kind: "planned" | "completed";
  title: string;
  discipline: string;
  scheduledDate: string;
  plannedMinutes: number | null;
  completedMinutes: number | null;
  href: string;
  status: "planned" | "completed" | "missed" | "unplanned";
};

/** Same local calendar day the planning calendar uses for activity cards. */
export function calendarActivityDateKey(startTime: string): string {
  return format(parseISO(startTime), "yyyy-MM-dd");
}

export function matchExtraActivitiesToPlannedSessions(
  extras: Array<{
    id: string;
    discipline: string;
    durationSeconds: number;
    dateKey: string;
  }>,
  planned: Array<{
    id: string;
    discipline: string;
    scheduledDate: string;
    linkedActivityId: string | null;
    estimatedDurationMinutes: number | null;
  }>
): Map<string, string> {
  const map = new Map<string, string>();
  const usedSessionIds = new Set<string>();
  const open = planned.filter((session) => session.linkedActivityId == null);

  const orderedExtras = [...extras].sort((a, b) => a.id.localeCompare(b.id));
  for (const extra of orderedExtras) {
    const candidates = open
      .filter(
        (session) =>
          session.scheduledDate === extra.dateKey &&
          session.discipline === extra.discipline &&
          !usedSessionIds.has(session.id)
      )
      .map((session) => ({
        id: session.id,
        estimatedDurationMinutes: session.estimatedDurationMinutes,
      }));
    const picked = pickFirstAutoLinkCandidate(
      candidates,
      extra.durationSeconds > 0 ? extra.durationSeconds / 60 : null
    );
    if (!picked) continue;
    map.set(extra.id, picked.id);
    usedSessionIds.add(picked.id);
  }
  return map;
}

export function buildDayStripSessions(options: {
  dateKey: string;
  todayKey: string;
  planned: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  linkedActivityIds: Set<string>;
  extraSessionIds: Map<string, string>;
  returnTo?: string;
}): DayStripSession[] {
  const returnTo = options.returnTo ?? "/dashboard";
  const dayPlanned = options.planned
    .filter((session) => session.scheduledDate === options.dateKey)
    .sort(compareSessionsForDayOrder);

  const extras = options.activities
    .filter((activity) => {
      if (options.linkedActivityIds.has(activity.id)) return false;
      return calendarActivityDateKey(activity.startTime) === options.dateKey;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

  const matched = matchExtraActivitiesToPlannedSessions(
    extras.map((activity) => ({
      id: activity.id,
      discipline: activity.discipline,
      durationSeconds: activity.durationSeconds,
      dateKey: options.dateKey,
    })),
    dayPlanned.map((session) => ({
      id: session.id,
      discipline: session.discipline,
      scheduledDate: session.scheduledDate,
      linkedActivityId: session.linkedActivity?.id ?? null,
      estimatedDurationMinutes: session.estimatedDurationMinutes,
    }))
  );

  const extraByMatchedSession = new Map<string, CalendarWeekActivity>();
  for (const extra of extras) {
    const sessionId = matched.get(extra.id);
    if (sessionId) extraByMatchedSession.set(sessionId, extra);
  }

  const sessions: DayStripSession[] = [];
  const isPast = options.dateKey < options.todayKey;

  for (const planned of dayPlanned) {
    const completion = sessionCompletionRollup({
      discipline: planned.discipline as Discipline,
      completedDurationMinutes: planned.completedDurationMinutes,
      completedDistanceMeters: planned.completedDistanceMeters,
      completedTargetSpeedMps: planned.completedTargetSpeedMps,
      completedTargetPaceSeconds: planned.completedTargetPaceSeconds,
      completedZones: planned.completedZones,
    });
    const matchedExtra = extraByMatchedSession.get(planned.id);
    const linkedMinutes =
      planned.linkedActivity != null
        ? Math.round((planned.linkedActivity.durationSeconds / 60) * 10) / 10
        : matchedExtra
          ? Math.round((matchedExtra.durationSeconds / 60) * 10) / 10
          : null;
    const completedMinutes = completion?.durationMinutes ?? linkedMinutes;
    const isDone =
      Boolean(planned.linkedActivity) ||
      planned.hasCompletedOverride ||
      matchedExtra != null ||
      completedMinutes != null;
    sessions.push({
      id: planned.id,
      kind: "planned",
      title: planned.title,
      discipline: planned.discipline,
      scheduledDate: planned.scheduledDate,
      plannedMinutes: planned.plannedMinutes > 0 ? planned.plannedMinutes : planned.estimatedDurationMinutes,
      completedMinutes,
      href: workoutHref(planned.id, { returnTo }),
      status: isDone ? "completed" : isPast ? "missed" : "planned",
    });
  }

  for (const extra of extras) {
    if (matched.has(extra.id)) continue;
    const sessionId = options.extraSessionIds.get(extra.id) ?? null;
    sessions.push({
      id: extra.id,
      kind: "completed",
      title: extra.name,
      discipline: extra.legType ?? extra.discipline,
      scheduledDate: options.dateKey,
      plannedMinutes: null,
      completedMinutes: Math.round((extra.durationSeconds / 60) * 10) / 10,
      href: workoutHrefForResolvedActivity(extra.id, sessionId, { returnTo }),
      status: "unplanned",
    });
  }

  return sessions;
}
