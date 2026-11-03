import type { Discipline } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  combinedZoneTotals,
  linkedActivityIdsExcludedFromCompletedRollup,
  mergeWeekSummaries,
  sportZoneTotals,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
  summarizeWeekPlannedSessions,
  type WeekPlannedSummary,
} from "@/lib/plan/calendar/week-summary";
import { addDaysToDateKey, mondayWeekStartKey } from "@/lib/dates";
import { matchExtraActivitiesToPlannedSessions } from "@/lib/dashboard/day-strip-sessions";
import { compareSessionsForDayOrder } from "@/lib/plan/session-day-order";
import {
  classifyPlannedSession,
  resolvePlannedSessionCompletion,
  type SessionProgressStatus,
} from "./session-status";
import { percentOf, zoneOverlapMinutes, zoneOverlapPercent, zoneTargetTotal } from "./zone-adherence";

export const PROGRESS_SPORTS = ["SWIM", "BIKE", "RUN"] as const;
export type ProgressSport = (typeof PROGRESS_SPORTS)[number];

export type WeekState = "past" | "current" | "future";

export type ProgressActivity = CalendarWeekActivity & {
  /** Activity-local calendar day (yyyy-MM-dd) the progress views bucket this activity into. */
  dateKey: string;
};

export type ProgressSessionRow = {
  kind: "planned" | "extra";
  id: string;
  title: string;
  discipline: string;
  date: string;
  status: SessionProgressStatus | "extra";
  plannedMinutes: number | null;
  completedMinutes: number | null;
  /** Planned session id (planned rows) or the linked session id when known (extras). */
  sessionId: string | null;
  activityId: string | null;
};

export type SessionCounts = {
  planned: number;
  done: number;
  partial: number;
  missed: number;
  upcoming: number;
  extra: number;
};

export type SportProgress = {
  discipline: Discipline;
  targetMinutes: number | null;
  plannedMinutes: number;
  completedMinutes: number;
  volumePercent: number | null;
  targetZones: number[];
  plannedZones: number[];
  actualZones: number[];
  counts: SessionCounts;
};

export type WeekProgress = {
  weekStart: string;
  weekEnd: string;
  state: WeekState;
  weekIndex: number | null;
  phase: { name: string; color: string } | null;
  isRestWeek: boolean;
  hasTarget: boolean;
  totals: {
    targetMinutes: number | null;
    plannedMinutes: number;
    completedMinutes: number;
    volumePercent: number | null;
    targetZones: number[];
    plannedZones: number[];
    actualZones: number[];
    zoneMatchPercent: number | null;
    zoneOverlapMinutes: number;
    ecos: number;
  };
  bySport: SportProgress[];
  strength: { counts: SessionCounts; plannedMinutes: number; completedMinutes: number } | null;
  counts: SessionCounts;
  /** done + partial over done + partial + missed; null while nothing is due yet. */
  adherencePercent: number | null;
  sessions: ProgressSessionRow[];
};

export type WeekProgressInput = {
  weekStart: string;
  todayKey: string;
  target: CalendarWeekTarget | null;
  sessions: CalendarPlannedSession[];
  activities: ProgressActivity[];
};

export function emptyCounts(): SessionCounts {
  return { planned: 0, done: 0, partial: 0, missed: 0, upcoming: 0, extra: 0 };
}

export function addCounts(a: SessionCounts, b: SessionCounts): SessionCounts {
  return {
    planned: a.planned + b.planned,
    done: a.done + b.done,
    partial: a.partial + b.partial,
    missed: a.missed + b.missed,
    upcoming: a.upcoming + b.upcoming,
    extra: a.extra + b.extra,
  };
}

export function adherenceFromCounts(counts: SessionCounts): number | null {
  const due = counts.done + counts.partial + counts.missed;
  return percentOf(counts.done + counts.partial, due);
}

export function weekStateFor(weekStart: string, todayKey: string): WeekState {
  const currentWeekStart = mondayWeekStartKey(todayKey);
  if (weekStart < currentWeekStart) return "past";
  if (weekStart === currentWeekStart) return "current";
  return "future";
}

function tally(counts: SessionCounts, status: ProgressSessionRow["status"], planned: boolean) {
  if (planned) counts.planned += 1;
  counts[status] += 1;
}

function sportSummary(summary: WeekPlannedSummary, discipline: Discipline) {
  return summary.bySport.find((row) => row.discipline === discipline);
}

function buildSessionRows(
  sessions: CalendarPlannedSession[],
  activities: ProgressActivity[],
  todayKey: string
): ProgressSessionRow[] {
  const linkedIds = new Set(
    sessions.map((s) => s.linkedActivity?.id).filter((id): id is string => Boolean(id))
  );
  const extras = activities
    .filter((a) => !linkedIds.has(a.id))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

  const matched = new Map<string, string>();
  const datesInPlay = new Set<string>([
    ...sessions.map((s) => s.scheduledDate),
    ...extras.map((a) => a.dateKey),
  ]);
  for (const dateKey of datesInPlay) {
    const dayMatches = matchExtraActivitiesToPlannedSessions(
      extras
        .filter((a) => a.dateKey === dateKey)
        .map((a) => ({
          id: a.id,
          discipline: a.discipline,
          durationSeconds: a.durationSeconds,
          dateKey,
        })),
      sessions
        .filter((s) => s.scheduledDate === dateKey)
        .map((s) => ({
          id: s.id,
          discipline: s.discipline,
          scheduledDate: s.scheduledDate,
          linkedActivityId: s.linkedActivity?.id ?? null,
          estimatedDurationMinutes: s.estimatedDurationMinutes,
        }))
    );
    for (const [activityId, sessionId] of dayMatches) matched.set(activityId, sessionId);
  }

  const extraBySession = new Map<string, ProgressActivity>();
  for (const extra of extras) {
    const sessionId = matched.get(extra.id);
    if (sessionId) extraBySession.set(sessionId, extra);
  }

  const rows: ProgressSessionRow[] = [];
  const ordered = [...sessions].sort(
    (a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || compareSessionsForDayOrder(a, b)
  );
  for (const session of ordered) {
    const matchedExtra = extraBySession.get(session.id);
    const completion = resolvePlannedSessionCompletion(
      session,
      matchedExtra?.durationSeconds ?? null
    );
    const plannedMinutes =
      session.plannedMinutes > 0 ? session.plannedMinutes : session.estimatedDurationMinutes;
    rows.push({
      kind: "planned",
      id: session.id,
      title: session.title,
      discipline: session.discipline,
      date: session.scheduledDate,
      status: classifyPlannedSession({
        dateKey: session.scheduledDate,
        todayKey,
        plannedMinutes,
        completion,
      }),
      plannedMinutes,
      completedMinutes: completion.completedMinutes,
      sessionId: session.id,
      activityId: session.linkedActivity?.id ?? matchedExtra?.id ?? null,
    });
  }
  for (const extra of extras) {
    if (matched.has(extra.id)) continue;
    rows.push({
      kind: "extra",
      id: extra.id,
      title: extra.name,
      discipline: extra.legType ?? extra.discipline,
      date: extra.dateKey,
      status: "extra",
      plannedMinutes: null,
      completedMinutes: Math.round((extra.durationSeconds / 60) * 10) / 10,
      sessionId: null,
      activityId: extra.id,
    });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildWeekProgress(input: WeekProgressInput): WeekProgress {
  const { weekStart, todayKey, target, sessions, activities } = input;
  const state = weekStateFor(weekStart, todayKey);

  const plannedSummary = summarizeWeekPlannedSessions(sessions);
  const excluded = linkedActivityIdsExcludedFromCompletedRollup(sessions);
  const completedSummary = mergeWeekSummaries(
    summarizeWeekCompletedSessions(sessions),
    summarizeWeekCompletedActivities(activities.filter((a) => !excluded.has(a.id)))
  );

  const rows = buildSessionRows(sessions, activities, todayKey);
  const counts = emptyCounts();
  const countsBySport = new Map<string, SessionCounts>();
  for (const row of rows) {
    const sportCounts = countsBySport.get(row.discipline) ?? emptyCounts();
    tally(counts, row.status, row.kind === "planned");
    tally(sportCounts, row.status, row.kind === "planned");
    countsBySport.set(row.discipline, sportCounts);
  }

  const targetBySport = new Map(target?.byDiscipline.map((row) => [row.discipline, row]));
  const bySport: SportProgress[] = PROGRESS_SPORTS.map((discipline) => {
    const targetRow = targetBySport.get(discipline);
    const targetMinutes = targetRow ? Math.round(targetRow.hours * 60) : null;
    const planned = sportSummary(plannedSummary, discipline);
    const completed = sportSummary(completedSummary, discipline);
    const completedMinutes = completed?.plannedMinutes ?? 0;
    return {
      discipline,
      targetMinutes,
      plannedMinutes: planned?.plannedMinutes ?? 0,
      completedMinutes,
      volumePercent: targetMinutes ? percentOf(completedMinutes, targetMinutes) : null,
      targetZones: target ? sportZoneTotals(discipline, target.zoneMinutes) : [0, 0, 0, 0, 0],
      plannedZones: sportZoneTotals(discipline, planned?.zoneMinutes ?? {}),
      actualZones: sportZoneTotals(discipline, completed?.zoneMinutes ?? {}),
      counts: countsBySport.get(discipline) ?? emptyCounts(),
    };
  });

  const strengthCounts = countsBySport.get("STRENGTH");
  const strengthPlanned = sportSummary(plannedSummary, "STRENGTH");
  const strengthCompleted = sportSummary(completedSummary, "STRENGTH");
  const strength =
    strengthCounts || (strengthPlanned?.sessionCount ?? 0) > 0
      ? {
          counts: strengthCounts ?? emptyCounts(),
          plannedMinutes: strengthPlanned?.plannedMinutes ?? 0,
          completedMinutes: strengthCompleted?.plannedMinutes ?? 0,
        }
      : null;

  const hasTarget = target != null;
  const targetMinutes = hasTarget
    ? bySport.reduce((sum, row) => sum + (row.targetMinutes ?? 0), 0)
    : null;
  const completedMinutes = bySport.reduce((sum, row) => sum + row.completedMinutes, 0);
  const plannedMinutes = bySport.reduce((sum, row) => sum + row.plannedMinutes, 0);
  const targetZones = target ? combinedZoneTotals(target.zoneMinutes) : [0, 0, 0, 0, 0];
  const actualZones = combinedZoneTotals(completedSummary.total.zoneMinutes);
  const plannedZones = combinedZoneTotals(plannedSummary.total.zoneMinutes);

  return {
    weekStart,
    weekEnd: addDaysToDateKey(weekStart, 6),
    state,
    weekIndex: target?.weekIndex ?? null,
    phase: target?.phase ?? null,
    isRestWeek: target?.isRestWeek ?? false,
    hasTarget,
    totals: {
      targetMinutes,
      plannedMinutes,
      completedMinutes,
      volumePercent: targetMinutes ? percentOf(completedMinutes, targetMinutes) : null,
      targetZones,
      plannedZones,
      actualZones,
      zoneMatchPercent: zoneTargetTotal(targetZones) > 0 ? zoneOverlapPercent(targetZones, actualZones) : null,
      zoneOverlapMinutes: zoneOverlapMinutes(targetZones, actualZones),
      ecos: completedSummary.total.ecos,
    },
    bySport,
    strength,
    counts,
    adherencePercent: adherenceFromCounts(counts),
    sessions: rows,
  };
}
