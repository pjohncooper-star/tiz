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
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Organize workouts in folders. Progression folders keep an ordered sequence.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <WorkoutLibraryView initialTree={tree} />
      </Suspense>
    </div>
  );
}
