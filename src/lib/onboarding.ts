import { db } from "@/lib/db";
import {
  DEFAULT_DISCIPLINE_SIGNALS,
  DEFAULT_ZONE_BOUNDARIES,
  getDefaultThreshold,
} from "@/lib/zones/defaults";
import type { Discipline, OnboardingStep, SignalType } from "@prisma/client";

const DISCIPLINES: Discipline[] = ["BIKE", "RUN", "SWIM"];
const SIGNALS: Record<Discipline, SignalType[]> = {
  BIKE: ["POWER", "HEART_RATE"],
  RUN: ["PACE", "HEART_RATE"],
  SWIM: ["PACE"],
  STRENGTH: ["HEART_RATE"],
};

export async function initializeAthleteDefaults(athleteId: string) {
  const effectiveDate = new Date();
  for (const discipline of DISCIPLINES) {
    const sig = DEFAULT_DISCIPLINE_SIGNALS[discipline];
    await db.athleteDisciplineSettings.create({
      data: {
        athleteId,
        discipline,
        primarySignal: sig.primary,
        fallbackSignal: sig.fallback,
        displayUnit: "METRIC",
        ...(discipline === "SWIM" ? { poolSize: "SCM" as const } : {}),
      },
    });
    await db.signalPreference.create({
      data: {
        athleteId,
        discipline,
        primarySignal: sig.primary,
        fallbackSignal: sig.fallback,
        effectiveDate,
      },
    });
    for (const signalType of SIGNALS[discipline]) {
      await db.thresholdProfile.create({
        data: {
          athleteId,
          discipline,
          signalType,
          thresholdValue: getDefaultThreshold(discipline, signalType),
          zoneCount: 5,
          zoneBoundaries: DEFAULT_ZONE_BOUNDARIES[signalType],
          effectiveDate: new Date(),
          isEstimated: true,
        },
      });
    }
  }
}

export async function setOnboardingStep(athleteId: string, step: OnboardingStep) {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { onboardingStep: true },
  });
  if (!athlete) return;
  // Onboarding is one-way: revisiting setup pages must not send athletes back through the flow.
  if (athlete.onboardingStep === "COMPLETE" && step !== "COMPLETE") return;

  await db.athlete.update({
    where: { id: athleteId },
    data: { onboardingStep: step },
  });
}

const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  "PROFILE",
  "THRESHOLDS",
  "HISTORICAL_THRESHOLDS",
  "IMPORT",
  "STRAVA",
  "DAY_FLAGS",
  "COMPLETE",
];

function onboardingIndex(step: OnboardingStep): number {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

/** Move forward to `target` only if the athlete has not reached it yet. Never demotes. */
export async function advanceOnboardingTo(
  athleteId: string,
  target: OnboardingStep
): Promise<OnboardingStep> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { onboardingStep: true },
  });
  if (!athlete) return target;

  const currentIdx = onboardingIndex(athlete.onboardingStep);
  const targetIdx = onboardingIndex(target);
  if (currentIdx >= 0 && targetIdx >= 0 && currentIdx < targetIdx) {
    await setOnboardingStep(athleteId, target);
    return target;
  }
  return athlete.onboardingStep;
}

/** Set `step` only while the athlete is still at or before `marker` (never demotes). */
export async function setOnboardingStepIfAtOrBefore(
  athleteId: string,
  marker: OnboardingStep,
  step: OnboardingStep
): Promise<OnboardingStep> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { onboardingStep: true },
  });
  if (!athlete) return step;

  const currentIdx = onboardingIndex(athlete.onboardingStep);
  const markerIdx = onboardingIndex(marker);
  if (currentIdx >= 0 && markerIdx >= 0 && currentIdx <= markerIdx) {
    await setOnboardingStep(athleteId, step);
    return step;
  }
  return athlete.onboardingStep;
}

export async function getHistorySpanMonths(athleteId: string): Promise<number> {
  const [first, last] = await Promise.all([
    db.syncedActivity.findFirst({
      where: { athleteId },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    }),
    db.syncedActivity.findFirst({
      where: { athleteId },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    }),
  ]);
  if (!first || !last) return 0;
  const ms = last.startTime.getTime() - first.startTime.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

export const SIGNALING_ACTIVATION_MONTHS = 9;
