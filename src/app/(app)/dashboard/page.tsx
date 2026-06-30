import { format, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { Card } from "@/components/ui";
import { DashboardWeekView } from "@/components/dashboard-week-view";
import { InsightsPanel } from "@/components/insights-panel";
import { insightPolarityFromOutcome } from "@/lib/signaling/v0";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import { getSignalingGateStatus } from "@/lib/signaling/gates";

export const dynamic = "force-dynamic";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_OPTS = { weekStartsOn: 1 as const };

type DashboardPageProps = {
  searchParams: Promise<{ week?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const params = await searchParams;
  const athleteId = session.user.athleteId!;
  const anchor =
    params.week && DATE_KEY.test(params.week) ? parseISO(params.week) : new Date();
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const weekEnd = endOfWeek(weekStart, WEEK_OPTS);

  const [gate, activities, insights, activityCount, bounds, allStarts] = await Promise.all([
    getSignalingGateStatus(athleteId),
    db.syncedActivity.findMany({
      where: {
        athleteId,
        startTime: { gte: weekStart, lte: weekEnd },
        ...recordedActivityWhere,
      },
      include: { zoneBreakdowns: { where: { isCanonical: true }, take: 1 } },
      orderBy: { startTime: "asc" },
    }),
    db.interactionInsight.findMany({
      where: { athleteId, tier: "V0" },
      orderBy: { generatedAt: "desc" },
      take: 6,
    }),
    db.syncedActivity.count({ where: { athleteId, ...recordedActivityWhere } }),
    db.syncedActivity.aggregate({
      where: { athleteId, ...recordedActivityWhere },
      _min: { startTime: true },
      _max: { startTime: true },
    }),
    db.syncedActivity.findMany({
      where: { athleteId, ...recordedActivityWhere },
      select: { startTime: true },
    }),
  ]);

  const activityDates = [
    ...new Set(allStarts.map((a) => format(a.startTime, "yyyy-MM-dd"))),
  ].sort((a, b) => b.localeCompare(a));

  const minDate = bounds._min.startTime
    ? format(bounds._min.startTime, "yyyy-MM-dd")
    : null;
  const maxDate = bounds._max.startTime
    ? format(bounds._max.startTime, "yyyy-MM-dd")
    : null;

  const weekActivities = activities.map((a) => ({
    id: a.id,
    name: a.name,
    startTime: a.startTime.toISOString(),
    discipline: a.discipline,
    source: a.source,
    signalUsed: a.zoneBreakdowns[0]?.signalUsed ?? null,
    noUsableSignal: a.noUsableSignal,
    durationSeconds: a.durationSeconds,
    multisportGroupId: a.multisportGroupId,
    sessionIndex: a.sessionIndex,
    legType: a.legType,
  }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500">{activityCount} activities total</p>
      </div>

      <Card title="Workout Signaling">
        <p className="text-sm text-zinc-600">{gate.message}</p>
        <div className="mt-2 h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-2 rounded bg-sky-600"
            style={{
              width: `${Math.min(100, (gate.monthsOfHistory / gate.requiredMonths) * 100)}%`,
            }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {gate.monthsOfHistory.toFixed(1)} / {gate.requiredMonths} months
          {gate.activated && ` · ${gate.eligibleDayCount} eligible days`}
        </p>
      </Card>

      <Card title="Insights">
        <InsightsPanel
          gateActivated={gate.activated}
          insights={insights.map((i) => ({
            id: i.id,
            headline: i.headline,
            sampleSize: i.sampleSize,
            confidenceNote: i.confidenceNote,
            polarity: insightPolarityFromOutcome(i.outcomePattern),
          }))}
        />
      </Card>

      <Card title="Training week">
        <DashboardWeekView
          weekStart={format(weekStart, "yyyy-MM-dd")}
          activities={weekActivities}
          activityDates={activityDates}
          minDate={minDate}
          maxDate={maxDate}
        />
      </Card>
    </main>
  );
}
