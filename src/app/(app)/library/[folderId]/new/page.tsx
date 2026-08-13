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
    <div className="space-y-4">
      <Link
        href={libraryHref({ folderId })}
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to {folder.name}
      </Link>
      <h2 className="text-xl font-semibold">New workout</h2>
      <WorkoutTemplateEditor
        mode="create"
        folderId={folderId}
        defaultDiscipline={folder.discipline ?? "RUN"}
        disciplineSettings={disciplineSettings}
      />
    </div>
  );
}
