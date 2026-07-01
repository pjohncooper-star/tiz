"use client";

import Link from "next/link";
import { libraryHref } from "@/lib/plan/library-href";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Discipline } from "@prisma/client";
import { WorkoutProfileChart } from "@/components/workout-profile-chart";
import { Button, Select } from "@/components/ui";
import { ASSEMBLED_WORKOUT_DRAG_ID } from "@/lib/plan/workout-builder-dnd";
import { totalTreeDurationMinutes } from "@/lib/workout/workout-tree";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import type { useWorkoutBuilder } from "@/components/calendar/use-workout-builder";

type BuilderState = ReturnType<typeof useWorkoutBuilder>;

type WorkoutBuilderPaneProps = {
  builder: BuilderState;
  onClose: () => void;
};

function FolderTreeButton({
  node,
  depth,
  onOpen,
}: {
  node: FolderTreeNode;
  depth: number;
  onOpen: (node: FolderTreeNode) => void;
}) {
  return (
    <div style={{ paddingLeft: `${depth * 12}px` }}>
      <button
        type="button"
        onClick={() => onOpen(node)}
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-sky-300 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <span className="block text-[10px] font-medium uppercase text-zinc-500">
          {node.folderKind === "PROGRESSION" ? "Progression" : "Library"}
        </span>
        <span className="font-medium">{node.name}</span>
        <span className="mt-0.5 block text-[10px] text-zinc-400">
          {node.workouts.length} workout{node.workouts.length === 1 ? "" : "s"}
        </span>
      </button>
      {node.children.map((child) => (
        <div key={child.id} className="mt-1">
          <FolderTreeButton node={child} depth={depth + 1} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

function WorkoutListButton({
  folder,
  workout,
  onSelect,
}: {
  folder: FolderTreeNode;
  workout: { id: string; name: string; sortOrder: number | null };
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        onClick={onSelect}
      >
        {folder.folderKind === "PROGRESSION" && workout.sortOrder != null
          ? `${workout.sortOrder + 1}. `
          : ""}
        {workout.name}
      </button>
    </li>
  );
}

function ProgressionPickerModal({
  picker,
  onClose,
}: {
  picker: NonNullable<BuilderState["picker"]>;
  onClose: () => void;
}) {
  const { folder } = picker;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">Choose workout</h3>
        <p className="mt-1 text-sm text-zinc-500">{folder.name}</p>
        <ul className="mt-4 space-y-2">
          {folder.workouts.map((workout) => (
            <WorkoutListButton
              key={workout.id}
              folder={folder}
              workout={workout}
              onSelect={() => picker.onSelect(workout)}
            />
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssembledWorkoutHandle({ disabled }: { disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ASSEMBLED_WORKOUT_DRAG_ID,
    data: { type: "assembled-workout" },
    disabled,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      disabled={disabled}
      className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 disabled:opacity-40 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
      {...listeners}
      {...attributes}
    >
      Drag workout to session
    </button>
  );
}

export function WorkoutBuilderPane({ builder, onClose }: WorkoutBuilderPaneProps) {
  const {
    discipline,
    setDiscipline,
    tree,
    loadingTree,
    selected,
    setSelected,
    picker,
    setPicker,
    openFolder,
    mergedNodes,
  } = builder;

  const totalMinutes =
    mergedNodes.length > 0 ? totalTreeDurationMinutes(mergedNodes) : 0;

  return (
    <>
      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Workout builder</span>
            <Select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
              className="w-auto"
            >
              <option value="RUN">Run</option>
              <option value="BIKE">Bike</option>
              <option value="SWIM">Swim</option>
            </Select>
            <Link
              href={libraryHref()}
              className="text-xs text-sky-600 hover:text-sky-800 dark:text-sky-400"
            >
              Manage library →
            </Link>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(null)}
              disabled={!selected}
            >
              Clear
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {mergedNodes.length > 0 ? (
          <div className="mb-3">
            <WorkoutProfileChart
              nodes={mergedNodes}
              discipline={selected!.discipline}
              lengthView="duration"
            />
            <p className="mt-1 text-xs text-zinc-500">
              {selected?.label}
              {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">
            Pick a workout from your library folders below.
          </p>
        )}

        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Library folders
        </p>
        <div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
          {loadingTree ? (
            <span className="text-sm text-zinc-500">Loading…</span>
          ) : tree.length === 0 ? (
            <span className="text-sm text-zinc-500">No folders yet.</span>
          ) : (
            tree.map((node) => (
              <FolderTreeButton
                key={node.id}
                node={node}
                depth={0}
                onOpen={(folder) => openFolder(folder)}
              />
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AssembledWorkoutHandle disabled={!selected} />
        </div>
      </div>

      {picker ? (
        <ProgressionPickerModal picker={picker} onClose={() => setPicker(null)} />
      ) : null}
    </>
  );
}
