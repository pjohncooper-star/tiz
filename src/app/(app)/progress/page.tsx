import { ProgressNav } from "@/components/progress/progress-nav";
import { SeasonProgressView } from "@/components/progress/season-progress-view";
import { WeekProgressView } from "@/components/progress/week-progress-view";
import { gateCompletedOnboarding, requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isEcoLoadEnabledForAthlete } from "@/lib/eco/preference";
import { mapActivityIdsToSessionIds } from "@/lib/plan/session-link";
import { workoutHref, workoutHrefForResolvedActivity } from "@/lib/plan/workout-href";
import { parseProgressParams, progressHref } from "@/lib/progress/href";
import { loadSeasonProgress, loadWeekProgress } from "@/lib/progress/progress.server";
import { requestTodayKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { onboardingStep: true },
  });
  if (athlete) await gateCompletedOnboarding(athleteId, athlete.onboardingStep);

  const todayKey = await requestTodayKey();
  const { view, weekStart } = parseProgressParams(await searchParams, todayKey);
  const ecoEnabled = await isEcoLoadEnabledForAthlete(athleteId);

  let body: React.ReactNode;
  if (view === "season") {
    const progress = await loadSeasonProgress(athleteId, todayKey);
    body = <SeasonProgressView progress={progress} ecoEnabled={ecoEnabled} />;
  } else {
    const { progress, selfEval } = await loadWeekProgress(athleteId, weekStart, todayKey);
    const returnTo = progressHref({ view: "week", weekStart });
    const extraActivityIds = progress.sessions
      .filter((row) => row.kind === "extra")
      .map((row) => row.id);
    const sessionIdByActivity = await mapActivityIdsToSessionIds(athleteId, extraActivityIds);

    const hrefByRowId: Record<string, string> = {};
    for (const row of progress.sessions) {
      hrefByRowId[row.id] =
        row.kind === "planned"
          ? workoutHref(row.id, { returnTo })
          : workoutHrefForResolvedActivity(row.id, sessionIdByActivity.get(row.id) ?? null, {
              returnTo,
            });
    }
    body = (
      <WeekProgressView
        progress={progress}
        selfEval={selfEval}
        ecoEnabled={ecoEnabled}
        hrefByRowId={hrefByRowId}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="text-sm text-zinc-500">
          How completed training compares with your plan and season targets.
        </p>
      </div>
      <ProgressNav view={view} weekStart={weekStart} todayKey={todayKey} />
      {body}
    </main>
  );
}
