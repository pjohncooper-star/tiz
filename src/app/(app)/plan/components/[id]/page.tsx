import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkoutComponentEditor } from "@/components/workout-component-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function EditWorkoutComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const { id } = await params;

  const component = await db.workoutComponent.findFirst({
    where: { id, athleteId },
    include: {
      progressionSteps: { orderBy: { orderIndex: "asc" } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });
  if (!component) notFound();

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
      <h1 className="text-2xl font-semibold">Edit component</h1>
      <WorkoutComponentEditor
        mode="edit"
        componentId={component.id}
        disciplineSettings={disciplineSettings}
        initial={{
          name: component.name,
          discipline: component.discipline,
          componentType: component.componentType,
          notes: component.notes ?? "",
          steps: component.steps,
          progressionSteps: component.progressionSteps.map((s) => ({
            id: s.id,
            label: s.label,
            orderIndex: s.orderIndex,
            steps: s.steps as unknown,
          })),
          lastCompletedSession: component.lastCompletedSession
            ? {
                id: component.lastCompletedSession.id,
                title: component.lastCompletedSession.title,
                scheduledDate: component.lastCompletedSession.scheduledDate
                  .toISOString()
                  .slice(0, 10),
              }
            : null,
          lastCompletedAt: component.lastCompletedAt?.toISOString() ?? null,
        }}
      />
    </main>
  );
}
