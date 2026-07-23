import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { advanceOnboardingTo } from "@/lib/onboarding";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.redirect(new URL("/login", getAppUrl(req)));
  }

  const athlete = await db.athlete.findUnique({
    where: { id: session.user.athleteId },
    select: { onboardingStep: true },
  });

  if (!athlete) {
    return NextResponse.redirect(new URL("/dashboard", getAppUrl(req)));
  }

  if (athlete.onboardingStep === "COMPLETE") {
    return NextResponse.redirect(new URL("/dashboard", getAppUrl(req)));
  }

  await advanceOnboardingTo(session.user.athleteId, "COMPLETE");

  return NextResponse.redirect(new URL("/dashboard", getAppUrl(req)));
}
