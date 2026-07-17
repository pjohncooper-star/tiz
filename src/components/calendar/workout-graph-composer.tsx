"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Discipline } from "@prisma/client";
import Link from "next/link";
import { Button, Select, SegmentedControl } from "@/components/ui";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
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
import {
  resolveSessionPoolSize,
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit } from "@/lib/workout/metrics";

type BuildBodyTab = "steps" | "components";

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

/** Inline warm-up / main / cool-down library for the expanded build panel. */
export function SegmentLibraryContent({ composer }: { composer: PoolWorkoutComposer }) {
  const columnTemplates = useMemo(() => {
    const map = {} as Record<SegmentFolderKind, PoolLibraryTemplate[]>;
    for (const kind of SEGMENT_FOLDER_KINDS) {
      map[kind] = templatesForSegmentColumn(composer.tree, kind);
    }
    return map;
  }, [composer.tree]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Components
        </p>
        <Link
          href={libraryHref()}
          className="text-[10px] text-sky-600 underline-offset-2 hover:underline"
        >
          Library
        </Link>
      </div>
      {composer.loadingTree ? (
        <p className="text-[11px] text-zinc-400">Loading…</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {SEGMENT_FOLDER_KINDS.map((kind) => (
          <section key={kind}>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {SEGMENT_COLUMN_LABELS[kind]}
            </h3>
            <div className="space-y-1.5">
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
                    ? "No main-set or library workouts."
                    : `Create a ${SEGMENT_COLUMN_LABELS[kind]} folder in the library.`}
                </p>
              )}
            </div>
          </section>
        ))}
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

function disciplineLabel(discipline: Discipline): string {
  return discipline.charAt(0) + discipline.slice(1).toLowerCase();
}

function useComposerUnits(
  composer: PoolWorkoutComposer,
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>
) {
  const unitSettings = unitSettingsForDiscipline(composer.discipline, disciplineSettings);
  const poolSize = resolveSessionPoolSize(composer.discipline, null, disciplineSettings);
  const displayUnit: DisplayUnit =
    composer.discipline === "SWIM" ? swimDisplayUnit(poolSize) : unitSettings.displayUnit;
  return { poolSize, displayUnit };
}

type WorkoutGraphPanelProps = {
  composer: PoolWorkoutComposer;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

function CollapsedBuildBar({
  composer,
  onEdit,
}: {
  composer: PoolWorkoutComposer;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] tabular-nums text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {disciplineLabel(composer.discipline)}
        </span>
        {composer.durationMinutes > 0 ? <span>· {composer.durationMinutes} min</span> : null}
        {composer.historySource ? (
          <span className="truncate text-[10px]">Source: {composer.historySource}</span>
        ) : null}
        {!composer.hasWorkout ? (
          <span className="text-[10px] text-zinc-400">No steps yet</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={onEdit}>
          Edit workout
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1 text-xs"
          onClick={composer.clear}
          disabled={!composer.hasWorkout}
        >
          Clear
        </Button>
        <AssembledDragHandle composer={composer} />
      </div>
    </div>
  );
}

/** Expandable build panel in the pool strip: collapse to drag bar, expand to edit. */
export function WorkoutGraphPanel({
  composer,
  disciplineSettings,
  expanded,
  onExpandedChange,
}: WorkoutGraphPanelProps) {
  const [bodyTab, setBodyTab] = useState<BuildBodyTab>("steps");
  const { setNodeRef, isOver } = useDroppable({
    id: "pool-workout-graph",
    data: { type: "pool-workout-graph" },
  });

  const { poolSize, displayUnit } = useComposerUnits(composer, disciplineSettings);

  if (!expanded) {
    return <CollapsedBuildBar composer={composer} onEdit={() => onExpandedChange(true)} />;
  }

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-500">
          Editing {disciplineLabel(composer.discipline)} workout
          {composer.durationMinutes > 0 ? ` · ${composer.durationMinutes} min` : ""}
        </span>
        <Button
          type="button"
          className="px-3 py-1 text-xs"
          onClick={() => onExpandedChange(false)}
        >
          Done
        </Button>
      </div>

      <div
        className={`absolute left-0 right-0 top-full z-40 mt-1 max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 ${
          isOver ? "ring-2 ring-sky-400 ring-offset-1 dark:ring-sky-600" : ""
        }`}
        ref={setNodeRef}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={composer.discipline}
              onChange={(e) =>
                composer.setDiscipline(e.target.value as typeof composer.discipline)
              }
              aria-label="Build discipline"
              className="px-2 py-1 text-xs"
            >
              <option value="SWIM">Swim</option>
              <option value="BIKE">Bike</option>
              <option value="RUN">Run</option>
            </Select>
            <SegmentedControl
              value={bodyTab}
              onChange={setBodyTab}
              options={[
                { value: "steps", label: "Steps" },
                { value: "components", label: "Components" },
              ]}
              className="text-xs"
            />
            {composer.historySource ? (
              <span className="text-[10px] text-zinc-500">Source: {composer.historySource}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tabular-nums text-zinc-500">
              {disciplineLabel(composer.discipline)}
              {composer.durationMinutes > 0 ? ` · ${composer.durationMinutes} min` : ""}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={composer.clear}
              disabled={!composer.hasWorkout}
            >
              Clear
            </Button>
          </div>
        </div>

        <WorkoutTreeEditor
          discipline={composer.discipline}
          displayUnit={displayUnit}
          poolSize={poolSize}
          tree={composer.workoutTree}
          onChange={composer.setWorkoutTree}
          chartOnly
        />

        <div className="mt-3 max-h-[min(40vh,20rem)] overflow-y-auto overscroll-contain">
          {bodyTab === "steps" ? (
            <WorkoutTreeEditor
              discipline={composer.discipline}
              displayUnit={displayUnit}
              poolSize={poolSize}
              tree={composer.workoutTree}
              onChange={composer.setWorkoutTree}
              stepsPanel
            />
          ) : (
            <SegmentLibraryContent composer={composer} />
          )}
        </div>

        <p className="mt-2 text-[10px] text-zinc-400">
          {bodyTab === "steps"
            ? "Add and edit steps below the graph, or switch to Components to append library segments. Click Done, then drag the workout onto a session."
            : "Click + or drag a component onto the graph. Switch to Steps to fine-tune, then Done and drag onto a session."}
        </p>
      </div>
    </div>
  );
}

/** @deprecated Use WorkoutGraphPanel with expand/collapse props */
export function WorkoutGraphComposer({
  composer,
  disciplineSettings,
}: {
  composer: PoolWorkoutComposer;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <WorkoutGraphPanel
      composer={composer}
      disciplineSettings={disciplineSettings}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
