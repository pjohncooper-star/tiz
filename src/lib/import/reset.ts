import { db } from "@/lib/db";
import { cleanupImport } from "@/lib/import/storage";
import { setOnboardingStep } from "@/lib/onboarding";
import type { OnboardingStep } from "@prisma/client";

/** Remove imported workouts and related data; optionally rewind onboarding. */
export async function resetImportData(
  athleteId: string,
  options: { onboardingStep?: OnboardingStep } = {}
) {
  const jobs = await db.importJob.findMany({
    where: { athleteId },
    select: { id: true },
  });

  for (const job of jobs) {
    await cleanupImport(job.id).catch(() => {});
  }

  await db.$transaction([
    db.surveyResponse.deleteMany({ where: { athleteId } }),
    db.interactionInsight.deleteMany({ where: { athleteId } }),
    db.syncedActivity.deleteMany({ where: { athleteId } }),
    db.importJob.deleteMany({ where: { athleteId } }),
    db.stravaConnection.deleteMany({ where: { athleteId } }),
  ]);

  if (options.onboardingStep) {
    await setOnboardingStep(athleteId, options.onboardingStep);
  }

  return {
    clearedJobs: jobs.length,
    onboardingStep: options.onboardingStep ?? null,
  };
}
