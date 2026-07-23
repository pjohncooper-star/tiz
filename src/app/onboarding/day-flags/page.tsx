import { Card } from "@/components/ui";
import { InsightsPanel } from "@/components/insights-panel";
import { DayFlagsForm } from "@/app/onboarding/day-flags/day-flags-form";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { finalizeLegacyDayFlagsStep } from "@/lib/onboarding";
import { getSignalingGateStatus } from "@/lib/signaling/gates";
import { insightPolarityFromOutcome } from "@/lib/signaling/v0";
import { isEcoTriggerPattern } from "@/lib/signaling/eco-patterns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkoutSignalingPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
  });
  if (!athlete) {
    onboardingRedirect("PROFILE");
    return null;
  }

  const step = await finalizeLegacyDayFlagsStep(athleteId, athlete.onboardingStep);
  if (step !== "COMPLETE") {
    onboardingRedirect(step);
    return null;
  }

  const ecoLoadEnabled = Boolean(
    "ecoLoadEnabled" in athlete ? athlete.ecoLoadEnabled : false
  );

  const [gate, insights] = await Promise.all([
    getSignalingGateStatus(athleteId),
    db.interactionInsight.findMany({
      where: { athleteId, tier: "V0" },
      orderBy: { generatedAt: "desc" },
      take: 12,
    }),
  ]);

  const visibleInsights = insights
    .filter((i) => ecoLoadEnabled || !isEcoTriggerPattern(i.triggerPattern))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-sky-600 hover:underline">
        ← Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Workout Signaling</h1>
        <p className="text-sm text-zinc-500">
          Flag standout days, then scan for risk and protective load patterns before
          flagged workouts.
        </p>
      </div>

      <Card title="Signaling gate">
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
          showFlagLink={false}
          gateActivated={gate.activated}
          insights={visibleInsights.map((i) => ({
            id: i.id,
            headline: i.headline,
            sampleSize: i.sampleSize,
            confidenceNote: i.confidenceNote,
            polarity: insightPolarityFromOutcome(i.outcomePattern),
          }))}
        />
      </Card>

      <DayFlagsForm />
    </div>
  );
}
