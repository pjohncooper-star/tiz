import { redirect } from "next/navigation";
import type { OnboardingStep } from "@prisma/client";
import { auth } from "@/lib/auth";
import { finalizeLegacyDayFlagsStep } from "@/lib/onboarding";
import { ONBOARDING_ROUTES } from "@/lib/onboarding/flow";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireAthlete() {
  const session = await requireSession();
  if (!session.user.athleteId) redirect("/onboarding/profile");
  return session;
}

export function onboardingRedirect(step: keyof typeof ONBOARDING_ROUTES) {
  redirect(ONBOARDING_ROUTES[step] ?? "/dashboard");
}

/** Redirect mid-onboarding athletes; auto-complete legacy DAY_FLAGS. */
export async function gateCompletedOnboarding(
  athleteId: string,
  step: OnboardingStep
) {
  const effective = await finalizeLegacyDayFlagsStep(athleteId, step);
  if (effective !== "COMPLETE") {
    onboardingRedirect(effective);
  }
}
