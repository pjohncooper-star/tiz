import Link from "next/link";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addDaysToDateKey, eachDateKey, normalizeWeekStart } from "@/lib/dates";
import { NewPlannedSessionClient } from "@/components/new-planned-session-client";
import { resolveWorkoutReturnHref, workoutReturnLabel } from "@/lib/plan/workout-return";
import { requestTodayKey } from "@/lib/timezone";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; returnTo?: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const { date: dateParam, returnTo: returnToParam } = await searchParams;
  const todayKey = await requestTodayKey();
  const dateKey = dateParam && DATE_KEY.test(dateParam) ? dateParam : todayKey;
  const returnTo = resolveWorkoutReturnHref(returnToParam);
  const weekStart = normalizeWeekStart(dateKey);
  const weekDays = eachDateKey(weekStart, addDaysToDateKey(weekStart, 6));

  const disciplineSettingsRows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
  });
  const disciplineSettings = buildDisciplineSettings(
    disciplineSettingsRows.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link
        href={returnTo}
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to {workoutReturnLabel(returnTo)}
      </Link>
      <NewPlannedSessionClient
        defaultDate={dateKey}
        weekDays={weekDays}
        disciplineSettings={disciplineSettings}
        returnTo={returnTo}
      />
    </main>
  );
}
