import { Suspense } from "react";
import { SeasonSetupWizard } from "@/components/season/season-setup-wizard";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlanSetupPage() {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <SeasonSetupWizard />
      </Suspense>
    </main>
  );
}
