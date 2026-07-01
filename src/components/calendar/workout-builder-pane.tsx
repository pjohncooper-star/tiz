"use client";

import Link from "next/link";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Discipline } from "@prisma/client";
import { WorkoutProfileChart } from "@/components/workout-profile-chart";
import { Button, Select } from "@/components/ui";
import { COMPONENT_TYPE_LABELS } from "@/lib/workout/component-types";
import { ASSEMBLED_WORKOUT_DRAG_ID } from "@/lib/plan/workout-builder-dnd";
import { totalTreeDurationMinutes } from "@/lib/workout/workout-tree";
import type { useWorkoutBuilder } from "@/components/calendar/use-workout-builder";

type BuilderState = ReturnType<typeof useWorkoutBuilder>;

type WorkoutBuilderPaneProps = {
  builder: BuilderState;
  onClose: () => void;
};

function LibraryCard({
  id,
  name,
  componentType,
}: {
  id: string;
  name: string;
  componentType: keyof typeof COMPONENT_TYPE_LABELS;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `component:${id}`,
    data: { type: "workout-component", componentId: id },
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:border-sky-300 dark:border-zinc-700 dark:bg-zinc-900"
      {...listeners}
      {...attributes}
    >
      <span className="block text-[10px] font-medium uppercase text-zinc-500">
        {COMPONENT_TYPE_LABELS[componentType]}
      </span>
      <span className="font-medium">{name}</span>
    </button>
  );
}

function PaletteChip({
  clientId,
  label,
  onRemove,
}: {
  clientId: string;
  label: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${clientId}`,
    data: { type: "palette-item", clientId },
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-zinc-400"
        aria-label="Reorder"
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
      <span>{label}</span>
      <button
        type="button"
        className="text-zinc-400 hover:text-red-600"
        aria-label="Remove"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

function PaletteDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: "palette-drop",
    data: { type: "palette-drop" },
  });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-[4rem] shrink-0 rounded-full border border-dashed px-3 py-1 text-xs ${
        isOver
          ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/30"
          : "border-zinc-300 text-zinc-400"
      }`}
    >
      + drop
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

function ProgressionPickerModal({
  picker,
  onClose,
}: {
  picker: NonNullable<BuilderState["picker"]>;
  onClose: () => void;
}) {
  const { component } = picker;
  const options: { id: string | null; label: string }[] = [
    { id: null, label: "Base" },
    ...component.progressionSteps.map((s) => ({ id: s.id, label: s.label })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">Choose progression</h3>
        <p className="mt-1 text-sm text-zinc-500">{component.name}</p>
        <ul className="mt-4 space-y-2">
          {options.map((opt) => (
            <li key={opt.id ?? "base"}>
              <button
                type="button"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() => {
                  picker.onSelect(opt.id, opt.label);
                  onClose();
                }}
              >
                {opt.label}
              </button>
            </li>
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

export function WorkoutBuilderPane({ builder, onClose }: WorkoutBuilderPaneProps) {
  const {
    discipline,
    setDiscipline,
    components,
    loadingComponents,
    palette,
    setPalette,
    mergedNodes,
    picker,
    setPicker,
    openPicker,
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
              href="/plan/components"
              className="text-xs text-sky-600 hover:text-sky-800 dark:text-sky-400"
            >
              Manage library →
            </Link>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPalette([])}
              disabled={palette.length === 0}
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
              discipline={discipline}
              lengthView="duration"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Total estimated duration: {totalMinutes > 0 ? `${totalMinutes} min` : "—"}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">
            Add components from the library below to build a workout.
          </p>
        )}

        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Library
        </p>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {loadingComponents ? (
            <span className="text-sm text-zinc-500">Loading…</span>
          ) : components.length === 0 ? (
            <span className="text-sm text-zinc-500">No components yet.</span>
          ) : (
            components.map((c) => (
              <div key={c.id} className="flex shrink-0 flex-col gap-1">
                <LibraryCard id={c.id} name={c.name} componentType={c.componentType} />
                <button
                  type="button"
                  className="text-[10px] text-sky-600 hover:underline"
                  onClick={() => openPicker(c)}
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Palette</p>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-x-auto">
            {palette.map((item) => (
              <PaletteChip
                key={item.clientId}
                clientId={item.clientId}
                label={item.progressionLabel}
                onRemove={() =>
                  setPalette((prev) => prev.filter((p) => p.clientId !== item.clientId))
                }
              />
            ))}
            <PaletteDropZone />
          </div>
          <AssembledWorkoutHandle disabled={palette.length === 0} />
        </div>
      </div>

      {picker ? (
        <ProgressionPickerModal picker={picker} onClose={() => setPicker(null)} />
      ) : null}
    </>
  );
}
