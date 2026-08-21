import { addDays, format, subDays } from "date-fns";
import { Card } from "@/components/ui";
import {
  DashboardDayStrip,
  type DayStripColumn,
} from "@/components/dashboard-day-strip";
import { DashboardGlanceCharts } from "@/components/dashboard-glance-charts";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import { requireAthlete, gateCompletedOnboarding } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import {
  cycleBoundsFromSeason,
  type CycleRangeBounds,
  type SeasonRangeBounds,
} from "@/lib/dashboard/date-range";
import { buildDayStripSessions } from "@/lib/dashboard/day-strip-sessions";
import { endDateKey, formatDateKey, parseDateKey } from "@/lib/dates";
import { requestTodayKey } from "@/lib/timezone";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializePlannedSessions, signalPrefsFromDisciplineSettings } from "@/lib/plan/calendar/serialize";
import { serializeCalendarActivities } from "@/lib/plan/calendar/activity-serialize";
import { loadPaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import { mapActivityIdsToSessionIds } from "@/lib/plan/session-link";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

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
  if (athlete) {
    await gateCompletedOnboarding(athlete.id, athlete.onboardingStep);
  }

  const athleteId = session.user.athleteId!;
  const ecoLoadEnabled = Boolean(
    athlete && "ecoLoadEnabled" in athlete ? athlete.ecoLoadEnabled : false
  );

  const todayKey = await requestTodayKey();
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
        trainingPlan: { select: { name: true } },
      },
        orderBy: [
          { scheduledDate: "asc" },
          { scheduledTimeMinutes: { sort: "asc", nulls: "last" } },
          { daySortOrder: "asc" },
          { title: "asc" },
        ],
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
  const bikeDisplayUnit = settings.BIKE?.displayUnit ?? "METRIC";

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
  const extraActivityIds = activities
    .filter((a) => !linkedActivityIds.has(a.id))
    .map((a) => a.id);
  const extraSessionIds = await mapActivityIdsToSessionIds(athleteId, extraActivityIds);

  const dateKeys = [yesterdayKey, todayKey, tomorrowKey] as const;
  const days: DayStripColumn[] = dateKeys.map((date, idx) => {
    const offset = (idx - 1) as -1 | 0 | 1;
    return {
      date,
      label: dayLabel(offset),
      isToday: offset === 0,
      sessions: buildDayStripSessions({
        dateKey: date,
        todayKey,
        planned,
        activities,
        linkedActivityIds,
        extraSessionIds,
      }),
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
          runDisplayUnit={runDisplayUnit === "IMPERIAL" ? "IMPERIAL" : "METRIC"}
          bikeDisplayUnit={bikeDisplayUnit === "IMPERIAL" ? "IMPERIAL" : "METRIC"}
        />
      </Card>
    </main>
  );
}
