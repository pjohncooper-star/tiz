import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ThresholdsStep } from "./thresholds-step";

export default async function ThresholdsStepPage() {
  const session = await auth();
  if (!session?.user?.athleteId) redirect("/login");

  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId },
    select: { onboardingStep: true },
  });

  // Athletes past onboarding edit thresholds inside settings, not the step flow.
  if (athlete?.onboardingStep === "COMPLETE") {
    redirect("/settings/thresholds");
  }

  return <ThresholdsStep />;
}
