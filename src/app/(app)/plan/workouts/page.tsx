import Link from "next/link";
import { Suspense } from "react";
import { WorkoutLibraryView } from "@/components/workout-library-view";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadFolderTree } from "@/lib/workout/workout-folder-library";

export const dynamic = "force-dynamic";

export default async function WorkoutLibraryPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const tree = await loadFolderTree(db, athleteId);

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/calendar"
            className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
          >
            ← Back to calendar
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Workout library</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Organize workouts in folders. Progression folders keep an ordered sequence.
          </p>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <WorkoutLibraryView initialTree={tree} />
      </Suspense>
    </main>
  );
}
