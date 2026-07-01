import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkoutTemplateEditor } from "@/components/workout-template-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { libraryHref } from "@/lib/plan/library-href";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function NewFolderWorkoutPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const { folderId } = await params;

  const folder = await db.workoutFolder.findFirst({
    where: { id: folderId, athleteId },
    select: { id: true, name: true, discipline: true },
  });
  if (!folder) notFound();

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
        href={libraryHref({ folderId })}
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to {folder.name}
      </Link>
      <h1 className="text-2xl font-semibold">New workout</h1>
      <WorkoutTemplateEditor
        mode="create"
        folderId={folderId}
        defaultDiscipline={folder.discipline ?? "RUN"}
        disciplineSettings={disciplineSettings}
      />
    </main>
  );
}
