import { redirect } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { OnboardingContinueButton } from "@/components/thresholds/onboarding-continue-button";
import { ThresholdsEditor } from "@/components/thresholds/thresholds-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadThresholdsEditorData } from "@/lib/thresholds/load-editor-data.server";

export const dynamic = "force-dynamic";

export default async function ThresholdsStep() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [athlete, initialData] = await Promise.all([
    db.athlete.findUnique({
      where: { id: athleteId },
      select: { onboardingStep: true },
    }),
    loadThresholdsEditorData(athleteId),
  ]);

  if (athlete?.onboardingStep === "COMPLETE") {
    redirect("/settings");
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="THRESHOLDS" />
      <div>
        <h1 className="text-2xl font-semibold">Step 2 — Current thresholds</h1>
        <p className="text-sm text-zinc-500">
          Set your best-guess thresholds for today, then continue to add historical
          changes before importing workouts.
        </p>
      </div>
      <ThresholdsEditor initialData={initialData} />
      <p className="text-sm text-zinc-500">
        Save thresholds & zones above before continuing.
      </p>
      <OnboardingContinueButton
        completeType="complete-thresholds"
        nextHref="/onboarding/threshold-history"
        label="Continue to historical thresholds"
      />
    </div>
  );
}
