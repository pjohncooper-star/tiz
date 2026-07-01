import Link from "next/link";
import { format } from "date-fns";
import { Button, Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import { COMPONENT_TYPE_LABELS } from "@/lib/workout/component-types";

export const dynamic = "force-dynamic";

export default async function WorkoutComponentsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;

  const components = await db.workoutComponent.findMany({
    where: { athleteId },
    orderBy: [{ discipline: "asc" }, { componentType: "asc" }, { name: "asc" }],
    include: {
      progressionSteps: { orderBy: { orderIndex: "asc" }, select: { id: true } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/calendar"
            className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
          >
            ← Back to calendar
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Workout components</h1>
        </div>
        <Link href="/plan/components/new">
          <Button type="button">New component</Button>
        </Link>
      </div>

      {components.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No components yet. Create warm-ups, main sets, and cool-downs to build workouts on the
            calendar.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {components.map((c) => (
            <li key={c.id}>
              <Link
                href={`/plan/components/${c.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-sky-300 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {c.discipline} · {COMPONENT_TYPE_LABELS[c.componentType]}
                      {c.progressionSteps.length > 0
                        ? ` · ${c.progressionSteps.length} progression steps`
                        : ""}
                    </p>
                  </div>
                  {c.lastCompletedSession ? (
                    <p className="text-xs text-zinc-500">
                      Last done{" "}
                      {c.lastCompletedAt
                        ? format(new Date(c.lastCompletedAt), "MMM d, yyyy")
                        : ""}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
