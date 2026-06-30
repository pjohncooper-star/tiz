import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SeasonSettingsSection } from "@/components/season/season-settings-section";
import { SeasonPlanChrome } from "@/components/season/season-plan-chrome";
import { sectionSlugToStep, sectionTitleForStep } from "@/components/season/season-settings-types";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { hasSetupCompleteSeason } from "@/lib/plan/season/season-plan.server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ section: string }>;
};

export default async function SeasonSettingsPage({ params }: PageProps) {
  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const ready = await hasSetupCompleteSeason(session.user.athleteId!);
  if (!ready) {
    notFound();
  }

  const { section } = await params;
  const step = sectionSlugToStep(section);
  if (step === null) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <SeasonPlanChrome>
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <SeasonSettingsSection step={step} title={sectionTitleForStep(step)} />
        </Suspense>
      </SeasonPlanChrome>
    </main>
  );
}
