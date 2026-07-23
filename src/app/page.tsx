import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { finalizeLegacyDayFlagsStep } from "@/lib/onboarding";
import { ONBOARDING_ROUTES } from "@/lib/onboarding/flow";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const step = session.user.onboardingStep;
  if (step && step !== "COMPLETE") {
    if (session.user.athleteId && step === "DAY_FLAGS") {
      await finalizeLegacyDayFlagsStep(session.user.athleteId, step);
      redirect("/dashboard");
    }
    redirect(ONBOARDING_ROUTES[step] ?? "/dashboard");
  }
  redirect("/dashboard");
}
