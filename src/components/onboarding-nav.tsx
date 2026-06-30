"use client";
import { useRouter } from "next/navigation";
import type { OnboardingStep } from "@prisma/client";
import { getPrevOnboardingStep } from "@/lib/onboarding/flow";

export function OnboardingBack({
  current,
  returnTo = "/dashboard",
}: {
  current: OnboardingStep;
  returnTo?: string;
}) {
  const router = useRouter();
  const prev = getPrevOnboardingStep(current);
  if (!prev) return null;

  async function goBack() {
    if (!prev) return;
    const settings = await fetch("/api/settings").then((r) => r.json());
    if (settings.onboardingStep === "COMPLETE") {
      router.push(returnTo);
      return;
    }
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "set-step", step: prev.step }),
    });
    router.push(prev.path);
  }

  return (
    <button type="button" onClick={goBack} className="text-sm text-sky-600 hover:underline">
      ← Back to {prev.title.toLowerCase()}
    </button>
  );
}
