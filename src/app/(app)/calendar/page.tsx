import {
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";
import Link from "next/link";
import { PlanningCalendar } from "@/components/calendar/planning-calendar";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import { serializePlannedSessions } from "@/lib/plan/calendar/serialize";
import { serializeCalendarActivities } from "@/lib/plan/calendar/activity-serialize";
import { weekStartsInRange } from "@/lib/plan/calendar/template.server";
import { getCalendarWeekTargets } from "@/lib/plan/calendar/week-targets.server";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import {
  calendarDateFromDb,
  endDateKey,
  normalizeWeekStart,
  parseDateKey,
  WEEK_OPTS,
} from "@/lib/dates";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import { buildWorkoutShadingSettings, parseWorkoutShadingTarget } from "@/lib/plan/workout-shading";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CONTEXT_WEEKS = 12;
const MAX_PAST_WEEKS = 52;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!isPlanningCalendarEnabled()) {
    redirect("/dashboard");
  }

  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId! },
    select: {
      onboardingStep: true,
      strengthPastWorkoutShading: true,
      workoutShadingTarget: true,
      ecoLoadEnabled: true,
    },
  });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const athleteId = session.user.athleteId!;
  const { week: weekParam } = await searchParams;
  const scrollWeekStart =
    weekParam && DATE_KEY.test(weekParam) ? normalizeWeekStart(weekParam) : null;

  const currentWeekStart = startOfWeek(new Date(), WEEK_OPTS);

  const [activityBounds, plannedBounds, totalActivityCount] = await Promise.all([
    db.syncedActivity.aggregate({
      where: { athleteId, ...recordedActivityWhere },
      _min: { startTime: true },
      _max: { startTime: true },
    }),
    db.plannedSession.aggregate({
      where: { athleteId },
      _min: { scheduledDate: true },
      _max: { scheduledDate: true },
    }),
    db.syncedActivity.count({ where: { athleteId, ...recordedActivityWhere } }),
  ]);

  // Load data around the most recent workout (or today if none), but land
  // the calendar viewport on this week unless ?week= is set.
  let dataWindowWeek = currentWeekStart;
  if (activityBounds._max.startTime) {
    dataWindowWeek = startOfWeek(activityBounds._max.startTime, WEEK_OPTS);
  }

  let rangeStart = addWeeks(dataWindowWeek, -CONTEXT_WEEKS);
  let rangeEnd = endOfWeek(addWeeks(dataWindowWeek, CONTEXT_WEEKS), WEEK_OPTS);

  if (plannedBounds._min.scheduledDate) {
    const plannedStart = startOfWeek(
      calendarDateFromDb(plannedBounds._min.scheduledDate),
      WEEK_OPTS
    );
    if (plannedStart < rangeStart) rangeStart = plannedStart;
  }
  if (plannedBounds._max.scheduledDate) {
    const plannedEnd = endOfWeek(
      calendarDateFromDb(plannedBounds._max.scheduledDate),
      WEEK_OPTS
    );
    if (plannedEnd > rangeEnd) rangeEnd = plannedEnd;
  }

  const futureFloor = endOfWeek(addWeeks(currentWeekStart, 8), WEEK_OPTS);
  if (rangeEnd < futureFloor) rangeEnd = futureFloor;

  const activeSeason = await getSimplePlannerSeason(athleteId);
  if (activeSeason) {
    const seasonStart = startOfWeek(
      calendarDateFromDb(activeSeason.startDate),
      WEEK_OPTS
    );
    const seasonEnd = endOfWeek(calendarDateFromDb(activeSeason.endDate), WEEK_OPTS);
    if (seasonStart < rangeStart) rangeStart = seasonStart;
    if (seasonEnd > rangeEnd) rangeEnd = seasonEnd;
  }

  const earliestAllowed = addWeeks(currentWeekStart, -MAX_PAST_WEEKS);
  if (rangeStart < earliestAllowed) rangeStart = earliestAllowed;

  if (scrollWeekStart) {
    const targetMonday = parseDateKey(scrollWeekStart);
    if (targetMonday < rangeStart) {
      rangeStart = targetMonday;
    }
    const targetRangeEnd = endOfWeek(addWeeks(targetMonday, CONTEXT_WEEKS), WEEK_OPTS);
    if (targetRangeEnd > rangeEnd) {
      rangeEnd = targetRangeEnd;
    }
  }

  const from = format(rangeStart, "yyyy-MM-dd");
  const to = format(rangeEnd, "yyyy-MM-dd");
  const fromDate = parseDateKey(from);
  const toDateEnd = endDateKey(to);

  const defaultScrollWeek = scrollWeekStart ?? format(currentWeekStart, "yyyy-MM-dd");

  const [plannedSessions, activities, allStarts, disciplineSettings] = await Promise.all([
    db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate: { gte: fromDate, lte: parseDateKey(to) },
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
    db.syncedActivity.findMany({
      where: { athleteId, ...recordedActivityWhere },
      select: { startTime: true },
    }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
  ]);

  const workoutShadingSettings = buildWorkoutShadingSettings(
    disciplineSettings.map((s) => ({
      discipline: s.discipline,
      pastWorkoutShading: s.pastWorkoutShading,
    })),
    athlete?.strengthPastWorkoutShading
  );

  const workoutShadingTarget = parseWorkoutShadingTarget(athlete?.workoutShadingTarget);

  const disciplineUnitSettings = buildDisciplineSettings(
    disciplineSettings.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const displayUnits = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.displayUnit])
  );

  const primarySignals = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.primarySignal])
  );

  const defaultPoolSizes = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.poolSize])
  );

  const activityDates = [
    ...new Set(allStarts.map((a) => format(a.startTime, "yyyy-MM-dd"))),
  ].sort((a, b) => b.localeCompare(a));

  const minDate = activityDates.length > 0 ? activityDates[activityDates.length - 1] : null;
  const maxDate = activityDates.length > 0 ? activityDates[0] : null;

  const weekActivities = serializeCalendarActivities(activities);
  const weekStarts = weekStartsInRange(from, to);
  const weekTargets = await getCalendarWeekTargets(athleteId, weekStarts);

  const initialData = {
    sessions: serializePlannedSessions(
      plannedSessions,
      displayUnits,
      defaultPoolSizes,
      primarySignals
    ),
    activities: weekActivities,
    weekStarts,
    weekTargets,
  };

  return (
    <main className="mx-auto max-w-none space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planning calendar</h1>
          <p className="text-sm text-zinc-500">
            Scroll up for past weeks and completed sessions, or down for upcoming weeks. Drag
            sessions between days and apply your weekly template.
          </p>
        </div>
        <Link href="/calendar/template" className="text-sm text-sky-600 hover:underline">
          Weekly template →
        </Link>
      </div>

      {totalActivityCount > 0 &&
        activities.length === 0 &&
        plannedSessions.length === 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            No workouts in the loaded date range. Use <strong>Jump to week</strong> and pick your
            last training day
            {maxDate ? ` (${maxDate})` : ""}, or scroll to find planned races.
          </p>
        )}

      <PlanningCalendar
        initialData={initialData}
        currentWeekStart={format(currentWeekStart, "yyyy-MM-dd")}
        initialScrollWeekStart={defaultScrollWeek}
        disciplineSettings={disciplineUnitSettings}
        workoutShadingSettings={workoutShadingSettings}
        workoutShadingTarget={workoutShadingTarget}
        ecoLoadEnabled={Boolean(athlete?.ecoLoadEnabled)}
        activityDates={activityDates}
        minDate={minDate}
        maxDate={maxDate}
      />
    </main>
  );
}
