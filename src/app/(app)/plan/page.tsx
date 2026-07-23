import { Suspense } from "react";
import { SimplePlannerView } from "@/components/simple-planner/simple-planner-view";
import { requireAthlete, gateCompletedOnboarding } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId! },
    select: { onboardingStep: true, ecoLoadEnabled: true },
  });
  if (athlete) {
    await gateCompletedOnboarding(session.user.athleteId!, athlete.onboardingStep);
  }

  const ecoLoadEnabled = Boolean(
    athlete && "ecoLoadEnabled" in athlete ? athlete.ecoLoadEnabled : false
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading season…</p>}>
        <SimplePlannerView ecoLoadEnabled={ecoLoadEnabled} />
      </Suspense>
    </main>
  );
}
