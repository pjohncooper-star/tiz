import { TrainingPlansLibraryView } from "@/components/training-plans-library-view";
import { requireAthlete } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TrainingPlansPage() {
  await requireAthlete();

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Reusable session packs for the calendar. Distinct from the workout folder library.
      </p>
      <TrainingPlansLibraryView />
    </div>
  );
}
