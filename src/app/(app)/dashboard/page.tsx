import { addDays, format, subDays } from "date-fns";
import { Card } from "@/components/ui";
import {
  DashboardDayStrip,
  type DayStripColumn,
  type DayStripSession,
} from "@/components/dashboard-day-strip";
import { DashboardGlanceCharts } from "@/components/dashboard-glance-charts";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import {
  cycleBoundsFromSeason,
  localTodayKey,
  type CycleRangeBounds,
  type SeasonRangeBounds,
} from "@/lib/dashboard/date-range";
import { endDateKey, formatDateKey, parseDateKey } from "@/lib/dates";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializePlannedSessions, signalPrefsFromDisciplineSettings } from "@/lib/plan/calendar/serialize";
import { serializeCalendarActivities } from "@/lib/plan/calendar/activity-serialize";
import { loadPaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import { sessionCompletionRollup } from "@/lib/plan/session-completion";
import { activityReturnHrefFromStartTime } from "@/lib/plan/activity-return";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import type { Discipline } from "@prisma/client";

export const dynamic = "force-dynamic";

function dayLabel(offset: -1 | 0 | 1): string {
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  return "Today";
}

export default async function DashboardPage() {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId! },
  });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const athleteId = session.user.athleteId!;
  const ecoLoadEnabled = Boolean(
    athlete && "ecoLoadEnabled" in athlete ? athlete.ecoLoadEnabled : false
  );

  const todayKey = localTodayKey();
  const yesterdayKey = format(subDays(parseDateKey(todayKey), 1), "yyyy-MM-dd");
  const tomorrowKey = format(addDays(parseDateKey(todayKey), 1), "yyyy-MM-dd");
  const fromDate = parseDateKey(yesterdayKey);
  const toDateEnd = endDateKey(tomorrowKey);

  const [plannedRows, activityRows, activityCount, seasonPlan, disciplineSettings] =
    await Promise.all([
      db.plannedSession.findMany({
        where: {
          athleteId,
          scheduledDate: { gte: fromDate, lte: parseDateKey(tomorrowKey) },
        },
        include: {
          structuredWorkout: true,
          linkedActivity: {
            select: {
              id: true,
              name: true,
              startTime: true,
              durationSeconds: true,
              distanceMeters: true,
              rawStreams: true,
              discipline: true,
              legType: true,
              zoneBreakdowns: {
                where: { isCanonical: true },
                select: { zone: true, minutes: true, isCanonical: true },
              },
            },
          },
        },
        orderBy: [{ scheduledDate: "asc" }, { title: "asc" }],
      }),
      db.syncedActivity.findMany({
        where: {
          athleteId,
          startTime: { gte: fromDate, lte: toDateEnd },
          ...recordedActivityWhere,
        },
        include: { zoneBreakdowns: { where: { isCanonical: true } } },
        orderBy: { startTime: "asc" },
      }),
      db.syncedActivity.count({ where: { athleteId, ...recordedActivityWhere } }),
      getSimplePlannerSeason(athleteId),
      db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    ]);

  const displayUnits = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.displayUnit])
  );
  const signalPrefs = signalPrefsFromDisciplineSettings(disciplineSettings);
  const defaultPoolSizes = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.poolSize])
  );
  const settings = buildDisciplineSettings(
    disciplineSettings.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );
  const runDisplayUnit = settings.RUN?.displayUnit ?? "METRIC";

  const paceContext = await loadPaceThresholdContext(athleteId);
  const planned = serializePlannedSessions(
    plannedRows,
    displayUnits,
    defaultPoolSizes,
    signalPrefs,
    paceContext
  );
  const activities = serializeCalendarActivities(activityRows);
  const linkedActivityIds = new Set(
    planned.map((p) => p.linkedActivity?.id).filter((id): id is string => Boolean(id))
  );

  const dateKeys = [yesterdayKey, todayKey, tomorrowKey] as const;
  const days: DayStripColumn[] = dateKeys.map((date, idx) => {
    const offset = (idx - 1) as -1 | 0 | 1;
    const sessions: DayStripSession[] = [];

    for (const p of planned.filter((s) => s.scheduledDate === date)) {
      const completion = sessionCompletionRollup({
        discipline: p.discipline as Discipline,
        completedDurationMinutes: p.completedDurationMinutes,
        completedDistanceMeters: p.completedDistanceMeters,
        completedTargetSpeedMps: p.completedTargetSpeedMps,
        completedTargetPaceSeconds: p.completedTargetPaceSeconds,
        completedZones: p.completedZones,
      });
      const linkedMinutes =
        p.linkedActivity != null
          ? Math.round((p.linkedActivity.durationSeconds / 60) * 10) / 10
          : null;
      const completedMinutes = completion?.durationMinutes ?? linkedMinutes;
      const isPast = date < todayKey;
      const isDone = Boolean(p.linkedActivity) || completedMinutes != null;
      sessions.push({
        id: p.id,
        kind: "planned",
        title: p.title,
        discipline: p.discipline,
        scheduledDate: p.scheduledDate,
        plannedMinutes: p.plannedMinutes > 0 ? p.plannedMinutes : p.estimatedDurationMinutes,
        completedMinutes,
        href: `/workouts/${p.id}`,
        status: isDone ? "completed" : isPast ? "missed" : "planned",
      });
    }

    for (const a of activities) {
      const activityDate = format(new Date(a.startTime), "yyyy-MM-dd");
      if (activityDate !== date) continue;
      if (linkedActivityIds.has(a.id)) continue;
      sessions.push({
        id: a.id,
        kind: "completed",
        title: a.name,
        discipline: a.legType ?? a.discipline,
        scheduledDate: date,
        plannedMinutes: null,
        completedMinutes: Math.round((a.durationSeconds / 60) * 10) / 10,
        href: `/activities/${a.id}?returnTo=${encodeURIComponent(activityReturnHrefFromStartTime(a.startTime))}`,
        status: "unplanned",
      });
    }

    sessions.sort((a, b) => a.title.localeCompare(b.title));

    return {
      date,
      label: dayLabel(offset),
      isToday: offset === 0,
      sessions,
    };
  });

  let seasonBounds: SeasonRangeBounds | null = null;
  let cycleBounds: CycleRangeBounds | null = null;
  if (seasonPlan) {
    seasonBounds = {
      startDate: formatDateKey(seasonPlan.startDate),
      endDate: formatDateKey(seasonPlan.endDate),
    };
    const mesocycles = seasonPlan.phases.flatMap((phase) =>
      phase.mesocycles.map((m) => ({
        name: m.name || phase.name,
        startWeekIndex: m.startWeekIndex,
        endWeekIndex: m.endWeekIndex,
      }))
    );
    cycleBounds = cycleBoundsFromSeason({
      seasonStartDate: seasonPlan.startDate,
      today: parseDateKey(todayKey),
      mesocycles,
    });
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">{activityCount} activities total</p>
      </div>

      <Card title="Yesterday · Today · Tomorrow">
        <DashboardDayStrip days={days} />
      </Card>

      <Card title={ecoLoadEnabled ? "PMC (ECO)" : "PMC (TiZ / hours)"}>
        <FitnessFatigueChart includePlan />
      </Card>

      <Card title="At a glance">
        <DashboardGlanceCharts
          season={seasonBounds}
          cycle={cycleBounds}
          displayUnit={runDisplayUnit === "IMPERIAL" ? "IMPERIAL" : "METRIC"}
        />
      </Card>
    </main>
  );
}
