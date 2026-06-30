import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ONBOARDING_ROUTES } from "@/lib/onboarding/flow";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.onboardingStep && session.user.onboardingStep !== "COMPLETE") {
    redirect(ONBOARDING_ROUTES[session.user.onboardingStep] ?? "/dashboard");
  }
  redirect("/dashboard");
}
