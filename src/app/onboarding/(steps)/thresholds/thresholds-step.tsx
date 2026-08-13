"use client";
import { useRouter } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { ThresholdsEditor } from "@/components/thresholds/thresholds-editor";

export function ThresholdsStep() {
  const router = useRouter();

  async function continueToHistory() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete-thresholds" }),
    });
    router.push("/onboarding/threshold-history");
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="THRESHOLDS" />
      <h1 className="text-2xl font-semibold">Step 2 — Current thresholds</h1>
      <ThresholdsEditor
        submitLabel="Continue to historical thresholds"
        onSaved={continueToHistory}
      />
    </div>
  );
}
