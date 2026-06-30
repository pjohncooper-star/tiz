import Link from "next/link";
import { WeeklyTemplateEditor } from "@/components/calendar/weekly-template-editor";
import { requireAthlete, onboardingRedirect } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isPlanningCalendarEnabled } from "@/lib/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarTemplatePage() {
  if (!isPlanningCalendarEnabled()) {
    redirect("/dashboard");
  }

  const session = await requireAthlete();
  const athlete = await db.athlete.findUnique({ where: { id: session.user.athleteId! } });
  if (athlete && athlete.onboardingStep !== "COMPLETE") {
    onboardingRedirect(athlete.onboardingStep);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <Link href="/calendar" className="text-sm text-sky-600 hover:underline">
          ← Back to calendar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Weekly template</h1>
        <p className="text-sm text-zinc-500">
          Define your default sessions for each day of the week. Use Apply template on the calendar
          to place them on a specific week.
        </p>
      </div>
      <WeeklyTemplateEditor />
    </main>
  );
}
