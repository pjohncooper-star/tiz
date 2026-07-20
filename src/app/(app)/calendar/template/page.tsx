import Link from "next/link";
import { WeeklyTemplateManager } from "@/components/calendar/weekly-template-manager";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { listWeeklyTemplateSummaries } from "@/lib/plan/calendar/template.server";
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

  const templates = await listWeeklyTemplateSummaries(athleteId);

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-6 px-4 py-8">
      <div className="max-w-3xl">
        <Link href="/calendar" className="text-sm text-sky-600 hover:underline">
          ← Back to calendar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Weekly template library</h1>
        <p className="text-sm text-zinc-500">
          Build reusable weekday layouts once and assign them to phases, rest weeks, and
          test weeks across any season. Use Apply template on the calendar to drop a
          template onto a specific week.
        </p>
      </div>
      <WeeklyTemplateManager initialTemplates={templates} />
    </main>
  );
}
