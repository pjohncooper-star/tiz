import type { OnboardingStep } from "@prisma/client";

export const ONBOARDING_STEPS = [
  { step: "PROFILE" as const, path: "/onboarding/profile", title: "Profile", number: 1 },
  { step: "THRESHOLDS" as const, path: "/onboarding/thresholds", title: "Current thresholds", number: 2 },
  {
    step: "HISTORICAL_THRESHOLDS" as const,
    path: "/onboarding/threshold-history",
    title: "Historical thresholds",
    number: 3,
  },
  { step: "IMPORT" as const, path: "/onboarding/import", title: "Historical import", number: 4 },
  { step: "STRAVA" as const, path: "/onboarding/strava", title: "Strava connect", number: 5 },
  { step: "DAY_FLAGS" as const, path: "/onboarding/day-flags", title: "Day flags", number: 6 },
];

export const ONBOARDING_ROUTES: Record<OnboardingStep, string> = {
  PROFILE: "/onboarding/profile",
  THRESHOLDS: "/onboarding/thresholds",
  HISTORICAL_THRESHOLDS: "/onboarding/threshold-history",
  IMPORT: "/onboarding/import",
  STRAVA: "/onboarding/strava",
  DAY_FLAGS: "/onboarding/day-flags",
  COMPLETE: "/dashboard",
};

export function getPrevOnboardingStep(current: OnboardingStep) {
  const idx = ONBOARDING_STEPS.findIndex((s) => s.step === current);
  if (idx <= 0) return null;
  return ONBOARDING_STEPS[idx - 1];
}

export function getOnboardingStepMeta(current: OnboardingStep) {
  return ONBOARDING_STEPS.find((s) => s.step === current);
}
