import Link from "next/link";
import { TrainingPlansLibraryView } from "@/components/training-plans-library-view";
import { requireAthlete } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TrainingPlansPage() {
  await requireAthlete();

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div>
        <Link
          href="/calendar"
          className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
        >
          ← Back to calendar
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Training plans</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reusable session packs for the calendar. Distinct from the workout folder library.
        </p>
      </div>
      <TrainingPlansLibraryView />
    </main>
  );
}
