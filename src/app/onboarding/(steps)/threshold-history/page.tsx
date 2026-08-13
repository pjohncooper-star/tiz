import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ThresholdHistoryStep } from "./threshold-history-step";

export default async function ThresholdHistoryStepPage() {
  const session = await auth();
  if (!session?.user?.athleteId) redirect("/login");

  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId },
    select: { onboardingStep: true },
  });

  // Athletes past onboarding edit threshold history inside settings, not the step flow.
  if (athlete?.onboardingStep === "COMPLETE") {
    redirect("/settings/thresholds");
  }

  return <ThresholdHistoryStep />;
}
