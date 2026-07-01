import Link from "next/link";
import { Card } from "@/components/ui";

type Source = {
  folder: { id: string; name: string; folderKind: string } | null;
  workoutTemplate: { id: string; name: string; sortOrder: number | null };
};

export function SessionWorkoutProvenance({ source }: { source: Source | null }) {
  if (!source) return null;

  const folderHref = source.folder
    ? `/plan/workouts?folder=${source.folder.id}`
    : "/plan/workouts";

  return (
    <Card title="Workout source">
      <p className="text-sm">
        {source.folder ? (
          <Link
            href={folderHref}
            className="font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            {source.folder.name}
          </Link>
        ) : (
          <span className="font-medium">Library</span>
        )}
        <span className="text-zinc-500">
          {" "}
          · {source.workoutTemplate.name}
          {source.folder?.folderKind === "PROGRESSION" &&
          source.workoutTemplate.sortOrder != null
            ? ` (step ${source.workoutTemplate.sortOrder + 1})`
            : ""}
        </span>
      </p>
    </Card>
  );
}
