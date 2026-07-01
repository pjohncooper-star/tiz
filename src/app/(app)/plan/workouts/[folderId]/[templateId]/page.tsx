import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkoutTemplateEditor } from "@/components/workout-template-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function EditFolderWorkoutPage({
  params,
}: {
  params: Promise<{ folderId: string; templateId: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const { folderId, templateId } = await params;

  const folder = await db.workoutFolder.findFirst({
    where: { id: folderId, athleteId },
    select: { id: true, name: true },
  });
  const workout = await db.workoutTemplate.findFirst({
    where: { id: templateId, athleteId, folderId },
  });
  if (!folder || !workout) notFound();

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
        href={`/plan/workouts?folder=${folderId}`}
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to {folder.name}
      </Link>
      <h1 className="text-2xl font-semibold">Edit workout</h1>
      <WorkoutTemplateEditor
        mode="edit"
        folderId={folderId}
        templateId={templateId}
        initial={{
          name: workout.name,
          discipline: workout.discipline,
          steps: workout.steps,
        }}
        disciplineSettings={disciplineSettings}
      />
    </main>
  );
}
