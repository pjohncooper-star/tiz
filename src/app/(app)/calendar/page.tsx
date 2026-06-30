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
import { normalizeWeekStart, parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import { buildWorkoutShadingSettings } from "@/lib/plan/workout-shading";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!isPlanningCalendarEnabled()) {
    redirect("/dashboard");
  }

  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const athleteId = session.user.athleteId!;
  const { week: weekParam } = await searchParams;
  const scrollWeekStart =
    weekParam && DATE_KEY.test(weekParam) ? normalizeWeekStart(weekParam) : null;

  const currentWeekStart = startOfWeek(new Date(), WEEK_OPTS);
  let rangeStart = currentWeekStart;
  let rangeEnd = endOfWeek(addWeeks(currentWeekStart, 2), WEEK_OPTS);

  if (scrollWeekStart) {
    const targetMonday = parseDateKey(scrollWeekStart);
    if (targetMonday < rangeStart) {
      rangeStart = targetMonday;
    }
    const targetRangeEnd = endOfWeek(addWeeks(targetMonday, 2), WEEK_OPTS);
    if (targetRangeEnd > rangeEnd) {
      rangeEnd = targetRangeEnd;
    }
  }

  const from = format(rangeStart, "yyyy-MM-dd");
  const to = format(rangeEnd, "yyyy-MM-dd");
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);

  const [plannedSessions, activities, allStarts, disciplineSettings] = await Promise.all([
    db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate: { gte: fromDate, lte: toDate },
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
        startTime: { gte: fromDate, lte: toDate },
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

  const initialData = {
    sessions: serializePlannedSessions(
      plannedSessions,
      displayUnits,
      defaultPoolSizes,
      primarySignals
    ),
    activities: weekActivities,
    weekStarts: weekStartsInRange(from, to),
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
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

      <PlanningCalendar
        initialData={initialData}
        currentWeekStart={format(currentWeekStart, "yyyy-MM-dd")}
        initialScrollWeekStart={scrollWeekStart}
        disciplineSettings={disciplineUnitSettings}
        workoutShadingSettings={workoutShadingSettings}
        activityDates={activityDates}
        minDate={minDate}
        maxDate={maxDate}
      />
    </main>
  );
}
