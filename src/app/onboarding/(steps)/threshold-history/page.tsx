import { redirect } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { OnboardingContinueButton } from "@/components/thresholds/onboarding-continue-button";
import { ThresholdHistoryEditor } from "@/components/thresholds/threshold-history-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadThresholdHistoryEditorData } from "@/lib/thresholds/load-editor-data.server";

export const dynamic = "force-dynamic";

export default async function ThresholdHistoryStep() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [athlete, initialData] = await Promise.all([
    db.athlete.findUnique({
      where: { id: athleteId },
      select: { onboardingStep: true },
    }),
    loadThresholdHistoryEditorData(athleteId),
  ]);

  if (athlete?.onboardingStep === "COMPLETE") {
    redirect("/settings/thresholds/history");
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="HISTORICAL_THRESHOLDS" />
      <div>
        <h1 className="text-2xl font-semibold">Step 3 — Historical thresholds</h1>
      </div>
      <ThresholdHistoryEditor initialData={initialData} />
      <OnboardingContinueButton
        completeType="complete-historical-thresholds"
        nextHref="/onboarding/import"
        label="Continue to historical import"
      />
    </div>
  );
}
