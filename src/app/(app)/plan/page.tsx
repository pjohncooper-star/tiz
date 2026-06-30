import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SeasonPlannerView } from "@/components/season/season-planner-view";
import { SeasonPlanChrome } from "@/components/season/season-plan-chrome";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasSetupCompleteSeason } from "@/lib/plan/season/season-plan.server";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
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
