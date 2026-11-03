import type { EventPriority } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { daysBetweenDateKeys, mondayWeekStartKey } from "@/lib/dates";
import {
  addCounts,
  adherenceFromCounts,
  buildWeekProgress,
  emptyCounts,
  type ProgressActivity,
  type SessionCounts,
  type WeekProgress,
  type WeekState,
} from "./week-progress";
import { addZoneArrays, percentOf, zoneTargetTotal } from "./zone-adherence";

export type SeasonWeekProgress = Omit<WeekProgress, "sessions"> & {
  phaseId: string | null;
};

export type SeasonPhaseInput = {
  id: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
};

export type SeasonGoalEventInput = {
  id: string;
  name: string;
  date: string;
  priority: EventPriority;
};

export type SeasonProgressInput = {
  season: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    totalWeeks: number;
    phases: SeasonPhaseInput[];
    goalEvents: SeasonGoalEventInput[];
  };
  /** Every Monday in the season, ascending. */
  weekStarts: string[];
  weekTargets: CalendarWeekTarget[];
  sessions: CalendarPlannedSession[];
  activities: ProgressActivity[];
  todayKey: string;
};

export type ProgressRollup = {
  weekCount: number;
  targetMinutes: number;
  completedMinutes: number;
  volumePercent: number | null;
  counts: SessionCounts;
  adherencePercent: number | null;
  targetZones: number[];
  actualZones: number[];
  zoneMatchPercent: number | null;
};

export type SeasonPhaseProgress = ProgressRollup & {
  id: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  totalWeeks: number;
  pastWeeks: number;
  state: WeekState;
};

export type SeasonGoalEventProgress = SeasonGoalEventInput & {
  /** Negative once the event has passed. */
  daysAway: number;
};

export type SeasonProgress = {
  seasonId: string;
  name: string;
  startDate: string;
  endDate: string;
  todayKey: string;
  totalWeeks: number;
  currentWeekIndex: number | null;
  futureWeeks: number;
  weeks: SeasonWeekProgress[];
  phases: SeasonPhaseProgress[];
  /** Completed weeks only; the in-progress week is excluded so it is not penalised. */
  toDate: ProgressRollup;
  goalEvents: SeasonGoalEventProgress[];
};

export function weekBucketKeyForSession(session: CalendarPlannedSession): string {
  return mondayWeekStartKey(session.scheduledDate);
}

/**
 * Group sessions and activities by Monday week. A linked activity follows its planned
 * session's week so the pair is never split across weeks; unlinked activities use their
 * own activity-local day.
 */
export function bucketProgressInputs(
  sessions: CalendarPlannedSession[],
  activities: ProgressActivity[]
): Map<string, { sessions: CalendarPlannedSession[]; activities: ProgressActivity[] }> {
  const buckets = new Map<
    string,
    { sessions: CalendarPlannedSession[]; activities: ProgressActivity[] }
  >();
  const bucket = (weekStart: string) => {
    let entry = buckets.get(weekStart);
    if (!entry) {
      entry = { sessions: [], activities: [] };
      buckets.set(weekStart, entry);
    }
    return entry;
  };

  const sessionWeekByActivity = new Map<string, string>();
  for (const session of sessions) {
    const week = weekBucketKeyForSession(session);
    bucket(week).sessions.push(session);
    if (session.linkedActivity) sessionWeekByActivity.set(session.linkedActivity.id, week);
  }
  for (const activity of activities) {
    const week = sessionWeekByActivity.get(activity.id) ?? mondayWeekStartKey(activity.dateKey);
    bucket(week).activities.push(activity);
  }
  return buckets;
}

export function rollupWeeks(weeks: SeasonWeekProgress[]): ProgressRollup {
  let targetMinutes = 0;
  let completedMinutes = 0;
  let counts = emptyCounts();
  let targetZones = [0, 0, 0, 0, 0];
  let actualZones = [0, 0, 0, 0, 0];
  let overlapMinutes = 0;
  for (const week of weeks) {
    targetMinutes += week.totals.targetMinutes ?? 0;
    completedMinutes += week.totals.completedMinutes;
    counts = addCounts(counts, week.counts);
    targetZones = addZoneArrays(targetZones, week.totals.targetZones);
    actualZones = addZoneArrays(actualZones, week.totals.actualZones);
    overlapMinutes += week.totals.zoneOverlapMinutes;
  }
  const zoneTarget = zoneTargetTotal(targetZones);
  return {
    weekCount: weeks.length,
    targetMinutes,
    completedMinutes,
    volumePercent: percentOf(completedMinutes, targetMinutes),
    counts,
    adherencePercent: adherenceFromCounts(counts),
    targetZones,
    actualZones,
    zoneMatchPercent: zoneTarget > 0 ? percentOf(overlapMinutes, zoneTarget) : null,
  };
}

function phaseForWeekIndex(
  phases: SeasonPhaseInput[],
  weekIndex: number | null
): SeasonPhaseInput | null {
  if (weekIndex == null) return null;
  return (
    phases.find(
      (phase) =>
        phase.startWeekIndex >= 0 &&
        weekIndex >= phase.startWeekIndex &&
        weekIndex <= phase.endWeekIndex
    ) ?? null
  );
}

export function buildSeasonProgress(input: SeasonProgressInput): SeasonProgress {
  const { season, weekStarts, weekTargets, sessions, activities, todayKey } = input;
  const targetByWeek = new Map(weekTargets.map((t) => [t.weekStart, t]));
  const buckets = bucketProgressInputs(sessions, activities);

  const weeks: SeasonWeekProgress[] = weekStarts.map((weekStart, index) => {
    const bucket = buckets.get(weekStart);
    const target = targetByWeek.get(weekStart) ?? null;
    const week: Omit<WeekProgress, "sessions"> & { sessions?: unknown } = buildWeekProgress({
      weekStart,
      todayKey,
      target,
      sessions: bucket?.sessions ?? [],
      activities: bucket?.activities ?? [],
    });
    delete week.sessions;
    const weekIndex = week.weekIndex ?? index;
    const phase = phaseForWeekIndex(season.phases, weekIndex);
    return {
      ...week,
      weekIndex,
      phase: week.phase ?? (phase ? { name: phase.name, color: phase.color } : null),
      phaseId: phase?.id ?? null,
    };
  });

  const pastWeeks = weeks.filter((w) => w.state === "past");
  const phases: SeasonPhaseProgress[] = season.phases
    .filter((phase) => phase.startWeekIndex >= 0)
    .map((phase) => {
      const phaseWeeks = weeks.filter((w) => w.phaseId === phase.id);
      const rollup = rollupWeeks(phaseWeeks.filter((w) => w.state === "past"));
      const state: WeekState = phaseWeeks.some((w) => w.state === "current")
        ? "current"
        : phaseWeeks.length > 0 && phaseWeeks.every((w) => w.state === "past")
          ? "past"
          : "future";
      return {
        ...rollup,
        id: phase.id,
        name: phase.name,
        color: phase.color,
        startWeekIndex: phase.startWeekIndex,
        endWeekIndex: phase.endWeekIndex,
        totalWeeks: phaseWeeks.length,
        pastWeeks: rollup.weekCount,
        state,
      };
    });

  const current = weeks.find((w) => w.state === "current");
  const goalEvents = season.goalEvents
    .map((event) => ({ ...event, daysAway: daysBetweenDateKeys(todayKey, event.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    seasonId: season.id,
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    todayKey,
    totalWeeks: season.totalWeeks,
    currentWeekIndex: current?.weekIndex ?? null,
    futureWeeks: weeks.filter((w) => w.state === "future").length,
    weeks,
    phases,
    toDate: rollupWeeks(pastWeeks),
    goalEvents,
  };
}
