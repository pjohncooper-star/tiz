import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function StravaStep() {
  const session = await auth();
  if (!session?.user?.athleteId) redirect("/login");

  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId },
    select: { onboardingStep: true },
  });

  if (athlete?.onboardingStep === "COMPLETE") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="STRAVA" />
      <div>
        <h1 className="text-2xl font-semibold">Step 5 — Connect Strava</h1>
        <p className="text-sm text-zinc-500">For ongoing activities after your historical import.</p>
      </div>
      <Card>
        <a
          href="/api/strava/connect?returnTo=/dashboard"
          className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Connect Strava
        </a>
        <p className="mt-3 text-sm">
          <Link href="/api/onboarding/skip-strava" className="text-sky-600">
            Skip for now
          </Link>
        </p>
      </Card>
    </div>
  );
}
