"use client";
import { useRouter } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { ThresholdHistoryEditor } from "@/components/thresholds/threshold-history-editor";
import { Button } from "@/components/ui";

export function ThresholdHistoryStep() {
  const router = useRouter();

  async function continueToImport() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete-historical-thresholds" }),
    });
    router.push("/onboarding/import");
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="HISTORICAL_THRESHOLDS" />
      <div>
        <h1 className="text-2xl font-semibold">Step 3 — Historical thresholds</h1>
        <p className="text-sm text-zinc-500">
          Add threshold and primary-metric changes with effective dates before importing
          workouts.
        </p>
      </div>

      <ThresholdHistoryEditor />

      <Button onClick={() => void continueToImport()}>Continue to historical import</Button>
    </div>
  );
}
