import type { DisplayUnit } from "@prisma/client";
import { db } from "@/lib/db";
import {
  activityLocalDateKey,
  addDaysToDateKey,
  mondayWeekStartKey,
  parseDateKey,
} from "@/lib/dates";
import { recordedActivityWhere } from "@/lib/import/classify";
import { serializeCalendarActivities } from "@/lib/plan/calendar/activity-serialize";
import {
  serializePlannedSessions,
  signalPrefsFromDisciplineSettings,
  type CalendarPlannedSession,
} from "@/lib/plan/calendar/serialize";
import { getCalendarWeekTargets } from "@/lib/plan/calendar/week-targets.server";
import { loadPaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializeSimpleSeasonPlan } from "@/lib/plan/season/simple-planner.server";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PoolSize } from "@/lib/units/discipline-settings";
import { summarizeSelfEval, type SelfEvalSummary } from "./self-eval-summary";
import { bucketProgressInputs, buildSeasonProgress, type SeasonProgress } from "./season-progress";
import { buildWeekProgress, type ProgressActivity, type WeekProgress } from "./week-progress";

type ProgressInputs = {
  sessions: CalendarPlannedSession[];
  activities: ProgressActivity[];
};

/**
 * Planned sessions in [from, to] and recorded activities whose local day could land in
 * [from, activityTo]. Streams are deliberately not selected: season-wide loads would
 * otherwise pull a year of raw stream JSON.
 */
async function loadProgressInputs(
  athleteId: string,
  from: string,
  to: string,
  activityTo: string = to
): Promise<ProgressInputs> {
  const activityFrom = new Date(`${addDaysToDateKey(from, -1)}T00:00:00.000Z`);
  const activityEnd = new Date(`${addDaysToDateKey(activityTo, 1)}T23:59:59.999Z`);

  const [plannedRows, activityRows, disciplineSettings, paceContext] = await Promise.all([
    db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate: { gte: parseDateKey(from), lte: parseDateKey(to) },
      },
      include: {
        structuredWorkout: { select: { steps: true } },
        linkedActivity: {
          select: {
            id: true,
            name: true,
            startTime: true,
            durationSeconds: true,
            distanceMeters: true,
            discipline: true,
            legType: true,
            zoneBreakdowns: {
              where: { isCanonical: true },
              select: { zone: true, minutes: true, isCanonical: true },
            },
          },
        },
        trainingPlan: { select: { name: true } },
      },
      orderBy: [{ scheduledDate: "asc" }, { daySortOrder: "asc" }, { title: "asc" }],
    }),
    activityTo < from
      ? Promise.resolve([])
      : db.syncedActivity.findMany({
          where: {
            athleteId,
            startTime: { gte: activityFrom, lte: activityEnd },
            ...recordedActivityWhere,
          },
          select: {
            id: true,
            name: true,
            startTime: true,
            utcOffsetSeconds: true,
            discipline: true,
            source: true,
            noUsableSignal: true,
            durationSeconds: true,
            distanceMeters: true,
            multisportGroupId: true,
            sessionIndex: true,
            legType: true,
            ecos: true,
            zoneBreakdowns: {
              where: { isCanonical: true },
              select: { zone: true, minutes: true, signalUsed: true, isCanonical: true },
            },
          },
          orderBy: { startTime: "asc" },
        }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    loadPaceThresholdContext(athleteId),
  ]);

  const displayUnits = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.displayUnit])
  ) as Partial<Record<string, DisplayUnit>>;
  const defaultPoolSizes = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.poolSize])
  ) as Partial<Record<PlanDiscipline, PoolSize | null>>;

  const sessions = serializePlannedSessions(
    plannedRows.map((row) => ({
      ...row,
      linkedActivity: row.linkedActivity ? { ...row.linkedActivity, rawStreams: null } : null,
    })),
    displayUnits,
    defaultPoolSizes,
    signalPrefsFromDisciplineSettings(disciplineSettings),
    paceContext
  );

  const serialized = serializeCalendarActivities(activityRows);
  const activities: ProgressActivity[] = serialized.map((activity, index) => ({
    ...activity,
    dateKey: activityLocalDateKey(
      activityRows[index]!.startTime,
      activityRows[index]!.utcOffsetSeconds
    ),
  }));

  return { sessions, activities };
}

export type WeekProgressResult = {
  progress: WeekProgress;
  selfEval: SelfEvalSummary | null;
};

export async function loadWeekProgress(
  athleteId: string,
  weekStartInput: string,
  todayKey: string
): Promise<WeekProgressResult> {
  const weekStart = mondayWeekStartKey(weekStartInput);
  const weekEnd = addDaysToDateKey(weekStart, 6);

  const [inputs, targets] = await Promise.all([
    loadProgressInputs(athleteId, weekStart, weekEnd),
    getCalendarWeekTargets(athleteId, [weekStart]),
  ]);

  const bucket = bucketProgressInputs(inputs.sessions, inputs.activities).get(weekStart);
  const sessions = bucket?.sessions ?? [];
  const activities = bucket?.activities ?? [];
  const progress = buildWeekProgress({
    weekStart,
    todayKey,
    target: targets[0] ?? null,
    sessions,
    activities,
  });

  const activityIds = [
    ...new Set([
      ...activities.map((a) => a.id),
      ...sessions.map((s) => s.linkedActivity?.id).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const surveys =
    activityIds.length > 0
      ? await db.surveyResponse.findMany({
          where: { athleteId, activityId: { in: activityIds } },
          select: { rpe: true, freshness: true, sleep: true, motivation: true, soreness: true },
        })
      : [];

  return { progress, selfEval: summarizeSelfEval(surveys) };
}

/** Progress for the athlete's active season, or null when there is none. */
export async function loadSeasonProgress(
  athleteId: string,
  todayKey: string
): Promise<SeasonProgress | null> {
  const plan = await getSimplePlannerSeason(athleteId);
  if (!plan) return null;

  let season: ReturnType<typeof serializeSimpleSeasonPlan>;
  try {
    season = serializeSimpleSeasonPlan(plan);
  } catch {
    return null;
  }

  const weekStarts = season.weeks.map((w) => w.weekStartDate).sort();
  if (weekStarts.length === 0) return null;

  const activityTo = todayKey < season.endDate ? todayKey : season.endDate;
  const [inputs, weekTargets] = await Promise.all([
    loadProgressInputs(athleteId, season.startDate, season.endDate, activityTo),
    getCalendarWeekTargets(athleteId, weekStarts),
  ]);

  return buildSeasonProgress({
    season: {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      totalWeeks: season.totalWeeks,
      phases: season.phases.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        startWeekIndex: p.startWeekIndex,
        endWeekIndex: p.endWeekIndex,
      })),
      goalEvents: season.goalEvents.map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        priority: e.priority,
      })),
    },
    weekStarts,
    weekTargets,
    sessions: inputs.sessions,
    activities: inputs.activities,
    todayKey,
  });
}
