import Link from "next/link";
import { WeeklyTemplateManager } from "@/components/calendar/weekly-template-manager";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarTemplatePage() {
  if (!isPlanningCalendarEnabled()) {
    redirect("/dashboard");
  }

  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const athlete = await db.athlete.findUnique({ where: { id: athleteId } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  const season = await getSimplePlannerSeason(athleteId);
  const phases = (season?.phases ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => ({ id: phase.id, name: phase.name }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <Link href="/calendar" className="text-sm text-sky-600 hover:underline">
          ← Back to calendar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Weekly templates</h1>
        <p className="text-sm text-zinc-500">
          Define the weekday layout of your sessions. The Default template feeds Apply
          template on the calendar; phase, rest, and test templates drive the active
          season&apos;s weeks.
        </p>
      </div>
      <WeeklyTemplateManager
        seasonPlanId={season?.id ?? null}
        seasonName={season?.name ?? null}
        phases={phases}
      />
    </main>
  );
}
