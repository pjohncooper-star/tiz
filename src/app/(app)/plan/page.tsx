import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SimplePlannerView } from "@/components/simple-planner/simple-planner-view";
import { SeasonPlannerView } from "@/components/season/season-planner-view";
import { SeasonPlanChrome } from "@/components/season/season-plan-chrome";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  isAdvancedSeasonPlannerEnabled,
  isSimpleSeasonPlannerEnabled,
} from "@/lib/features";
import { hasSetupCompleteSeason } from "@/lib/plan/season/season-plan.server";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  if (isSimpleSeasonPlannerEnabled()) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading season…</p>}>
          <SimplePlannerView showAdvancedLink={isAdvancedSeasonPlannerEnabled()} />
        </Suspense>
      </main>
    );
  }

  const ready = await hasSetupCompleteSeason(session.user.athleteId!);
  if (!ready) {
    redirect("/plan/setup");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <SeasonPlanChrome>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading season…</p>}>
          <SeasonPlannerView />
        </Suspense>
      </SeasonPlanChrome>
    </main>
  );
}
