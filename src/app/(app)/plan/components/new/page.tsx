import Link from "next/link";
import { WorkoutComponentEditor } from "@/components/workout-component-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function NewWorkoutComponentPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;

  const disciplineSettingsRows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
  });
  const disciplineSettings = buildDisciplineSettings(
    disciplineSettingsRows.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <Link
        href="/plan/components"
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to library
      </Link>
      <h1 className="text-2xl font-semibold">New component</h1>
      <WorkoutComponentEditor mode="create" disciplineSettings={disciplineSettings} />
    </main>
  );
}
