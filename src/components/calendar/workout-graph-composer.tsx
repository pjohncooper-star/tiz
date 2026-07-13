"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Discipline } from "@prisma/client";
import { Button, Select } from "@/components/ui";
import { WorkoutProfileChart } from "@/components/workout-profile-chart";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";
import {
  SEGMENT_COLUMN_LABELS,
  SEGMENT_FOLDER_KINDS,
  templatesForSegmentColumn,
  type SegmentFolderKind,
} from "@/lib/plan/calendar/workout-graph-compose";
import { poolSegmentDragId } from "@/lib/plan/workout-builder-dnd";
import { buildWorkoutProfile, defaultPrimarySignalForDiscipline } from "@/lib/workout/workout-profile";
import { templateNodes } from "@/lib/workout/apply-workout-template";
import type { PoolLibraryTemplate } from "@/lib/plan/calendar/pool-library";
import type { CalendarWorkoutProfile } from "@/lib/plan/calendar/serialize";
import type { PoolWorkoutComposer } from "@/components/calendar/use-pool-workout-composer";
import { libraryHref } from "@/lib/plan/library-href";
import Link from "next/link";

type WorkoutGraphComposerProps = {
  composer: PoolWorkoutComposer;
};

function toMiniProfile(
  nodes: ReturnType<typeof templateNodes>,
  discipline: Discipline
): CalendarWorkoutProfile | null {
  if (nodes.length === 0) return null;
  const built = buildWorkoutProfile(nodes, {
    primarySignal: defaultPrimarySignalForDiscipline(discipline),
    lengthView: "duration",
    discipline,
  });
  if (built.segments.length === 0) return null;
  return {
    totalX: built.totalX,
    yMin: built.yMin,
    yMax: built.yMax,
    segments: built.segments.map((s) => ({
      x: s.x,
      width: s.width,
      yLow: s.yLow,
      yHigh: s.yHigh,
      fill: s.fill,
    })),
  };
}

function SegmentLibraryCard({
  template,
  column,
  discipline,
  onAdd,
}: {
  template: PoolLibraryTemplate;
  column: SegmentFolderKind;
  discipline: Discipline;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: poolSegmentDragId(template.templateId, column),
    data: {
      type: "pool-segment-template",
      column,
      template,
    },
  });

  const [profile, setProfile] = useState<CalendarWorkoutProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function ensureProfile() {
    if (loaded) return;
    setLoaded(true);
    const res = await fetch(
      `/api/plan/workout-folders/${template.folderId}/workouts/${template.templateId}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as { workout: { steps: unknown } };
    setProfile(toMiniProfile(templateNodes(data.workout), discipline));
  }

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border border-zinc-200 bg-white p-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      onMouseEnter={() => void ensureProfile()}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{template.name}</p>
          <p className="truncate text-[10px] text-zinc-400">{template.folderName}</p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            className="rounded px-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
            onClick={onAdd}
            aria-label={`Add ${template.name} to graph`}
          >
            +
          </button>
          <button
            type="button"
            className="cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
            aria-label={`Drag ${template.name}`}
            {...listeners}
            {...attributes}
          >
            ⠿
          </button>
        </div>
      </div>
      {profile ? (
        <div className="mt-1">
          <WorkoutProfileMiniChart profile={profile} />
        </div>
      ) : (
        <div className="mt-1 h-6 rounded bg-zinc-100 dark:bg-zinc-800" />
      )}
    </div>
  );
}

function IntervalEditor({
  composer,
}: {
  composer: PoolWorkoutComposer;
}) {
  if (!composer.intervalOpen) return null;
  const d = composer.intervalDraft;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">Custom interval</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-zinc-500">Reps</span>
            <input
              type="number"
              min={1}
              max={40}
              className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              value={d.reps}
              onChange={(e) =>
                composer.setIntervalDraft({ ...d, reps: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Work (sec)</span>
            <input
              type="number"
              min={1}
              className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              value={d.workSeconds}
              onChange={(e) =>
                composer.setIntervalDraft({ ...d, workSeconds: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Work zone</span>
            <input
              type="number"
              min={1}
              max={5}
              className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              value={d.workZone}
              onChange={(e) =>
                composer.setIntervalDraft({ ...d, workZone: Number(e.target.value) || 1 })
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-zinc-500">Rest (sec)</span>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              value={d.restSeconds}
              onChange={(e) =>
                composer.setIntervalDraft({ ...d, restSeconds: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => composer.setIntervalOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => composer.addCustomInterval()}>
            Add to graph
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssembledDragHandle({ composer }: { composer: PoolWorkoutComposer }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: composer.assembledDragId,
    data: {
      type: "assembled-workout",
      discipline: composer.discipline,
      nodes: composer.mergedNodes,
    },
    disabled: !composer.hasWorkout,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      disabled={!composer.hasWorkout}
      className="cursor-grab rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
      {...listeners}
      {...attributes}
    >
      Drag to session ▶
    </button>
  );
}

function GraphDropSurface({ composer }: { composer: PoolWorkoutComposer }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "pool-workout-graph",
    data: { type: "pool-workout-graph" },
  });

  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded-md ring-2 ring-sky-400 ring-offset-1 dark:ring-sky-600" : undefined}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Workout graph</h3>
          {composer.historySource ? (
            <p className="text-[10px] text-zinc-500">Source: {composer.historySource}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] tabular-nums text-zinc-500">
            {composer.discipline.charAt(0) + composer.discipline.slice(1).toLowerCase()}
            {composer.durationMinutes > 0 ? ` · ${composer.durationMinutes} min` : ""}
          </span>
          <Button type="button" variant="secondary" onClick={() => composer.setIntervalOpen(true)}>
            + Interval
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={composer.clear}
            disabled={!composer.hasWorkout}
          >
            Clear
          </Button>
          <AssembledDragHandle composer={composer} />
        </div>
      </div>

      {composer.hasWorkout ? (
        <>
          <WorkoutProfileChart
            nodes={composer.mergedNodes}
            discipline={composer.discipline}
            lengthView="duration"
          />
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {composer.segments.map((segment, index) => (
              <li
                key={segment.id}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <span className="font-medium">{segment.label}</span>
                <button
                  type="button"
                  className="text-zinc-400 hover:text-zinc-600"
                  disabled={index === 0}
                  onClick={() => composer.moveSegment(segment.id, -1)}
                  aria-label="Move earlier"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="text-zinc-400 hover:text-zinc-600"
                  disabled={index === composer.segments.length - 1}
                  onClick={() => composer.moveSegment(segment.id, 1)}
                  aria-label="Move later"
                >
                  →
                </button>
                <button
                  type="button"
                  className="text-zinc-400 hover:text-red-600"
                  onClick={() => composer.removeSegment(segment.id)}
                  aria-label="Remove segment"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-center text-xs text-zinc-400">
          Drop warm-up, main, or cool-down pieces here — or click a past structured session to load
          its profile.
        </p>
      )}

      <p className="mt-2 text-[10px] text-zinc-400">
        Drag the assembled workout onto an empty skeleton on the pool week.
      </p>
    </div>
  );
}

export function WorkoutGraphComposer({ composer }: WorkoutGraphComposerProps) {
  const columnTemplates = useMemo(() => {
    const map = {} as Record<SegmentFolderKind, PoolLibraryTemplate[]>;
    for (const kind of SEGMENT_FOLDER_KINDS) {
      map[kind] = templatesForSegmentColumn(composer.tree, kind);
    }
    return map;
  }, [composer.tree]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={composer.discipline}
            onChange={(e) => composer.setDiscipline(e.target.value as typeof composer.discipline)}
            aria-label="Build discipline"
          >
            <option value="SWIM">Swim</option>
            <option value="BIKE">Bike</option>
            <option value="RUN">Run</option>
          </Select>
          {composer.loadingTree ? (
            <span className="text-[11px] text-zinc-400">Loading library…</span>
          ) : null}
        </div>
        <Link
          href={libraryHref()}
          className="text-[11px] text-sky-600 underline-offset-2 hover:underline"
        >
          Manage library folders
        </Link>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
        {SEGMENT_FOLDER_KINDS.map((kind) => (
          <section
            key={kind}
            className="min-h-[8rem] rounded-lg border border-zinc-200 bg-white/80 p-2 dark:border-zinc-700 dark:bg-zinc-950/40"
          >
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {SEGMENT_COLUMN_LABELS[kind]}
            </h3>
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {columnTemplates[kind].length > 0 ? (
                columnTemplates[kind].map((template) => (
                  <SegmentLibraryCard
                    key={`${kind}-${template.templateId}`}
                    template={template}
                    column={kind}
                    discipline={composer.discipline}
                    onAdd={() =>
                      void composer.appendTemplate(
                        template.folderId,
                        template.templateId,
                        template.name
                      )
                    }
                  />
                ))
              ) : (
                <p className="text-[10px] leading-snug text-zinc-400">
                  {kind === "MAIN_SET"
                    ? "No main-set or library workouts for this discipline."
                    : `Create a ${SEGMENT_COLUMN_LABELS[kind]} folder in the library to populate this column.`}
                </p>
              )}
            </div>
          </section>
        ))}
        <section className="flex min-h-[8rem] flex-col justify-between rounded-lg border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            + Custom interval
          </h3>
          <p className="text-[10px] text-zinc-400">
            Build a repeat block and append it to the graph.
          </p>
          <Button type="button" variant="secondary" onClick={() => composer.setIntervalOpen(true)}>
            + Interval
          </Button>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
        <GraphDropSurface composer={composer} />
      </section>

      <IntervalEditor composer={composer} />
    </div>
  );
}
