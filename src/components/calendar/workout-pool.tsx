"use client";

import { PoolLibrarySection } from "@/components/calendar/pool-library-section";
import { useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  computeUnscheduledChips,
  hasUsableTypedSlotBudgets,
  type PoolDiscipline,
  type UnscheduledChip,
} from "@/lib/plan/calendar/unscheduled-chips";
import {
  unscheduledAttachmentLabel,
  type UnscheduledAttachment,
} from "@/lib/plan/calendar/pool-unscheduled-attachment";
import {
  combinedZoneTotals,
  linkedActivityIdsExcludedFromCompletedRollup,
  mergeWeekSummaries,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
  summarizeWeekPlannedSessions,
} from "@/lib/plan/calendar/week-summary";
import {
  poolArmedUnscheduledDragId,
  poolUnscheduledDragId,
  poolUnscheduledDropId,
} from "@/lib/plan/workout-builder-dnd";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";

function PoolSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        {hint ? <p className="mt-0.5 text-[10px] leading-snug text-zinc-400">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function UnscheduledChipCard({
  chip,
  attachment,
  selectedDateKey,
  onClearAttachment,
}: {
  chip: UnscheduledChip;
  attachment?: UnscheduledAttachment;
  selectedDateKey: string | null;
  onClearAttachment?: (chipId: string) => void;
}) {
  const armed = !!attachment;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: armed ? poolArmedUnscheduledDragId(chip.id) : poolUnscheduledDragId(chip.id),
    data: armed
      ? { type: "pool-armed-unscheduled", chip, attachment }
      : { type: "pool-unscheduled", chip },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: poolUnscheduledDropId(chip.id),
    data: { type: "pool-unscheduled-drop", chip, selectedDateKey },
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={setNodeRef}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        armed
          ? "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40"
          : "border-dashed border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
      } ${isDragging ? "opacity-50" : ""} ${
        isOver ? "ring-2 ring-sky-400 ring-offset-1 dark:ring-sky-600" : ""
      }`}
    >
      <span className="font-medium text-zinc-700 dark:text-zinc-200">{chip.label}</span>
      <span className="text-zinc-400">×1</span>
      {armed ? (
        <>
          <span className="truncate text-zinc-500">· {unscheduledAttachmentLabel(attachment)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClearAttachment?.(chip.id);
            }}
            className="shrink-0 text-zinc-400 hover:text-zinc-600"
            aria-label="Clear attached workout"
          >
            ×
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={
          armed
            ? `Drag ${chip.label} with workout to a day`
            : `Drag unscheduled ${chip.label}`
        }
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
    </div>
  );
}

function WeekTizFooter({
  weekTarget,
  sessions,
  activities,
  weekStart,
  currentWeekStart,
}: {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekStart: string;
  currentWeekStart: string;
}) {
  const plannedSummary = summarizeWeekPlannedSessions(sessions);
  const showCompleted = weekStart <= currentWeekStart;
  const completedSummary = showCompleted
    ? mergeWeekSummaries(
        summarizeWeekCompletedSessions(sessions),
        summarizeWeekCompletedActivities(
          activities.filter(
            (activity) =>
              !linkedActivityIdsExcludedFromCompletedRollup(sessions).has(activity.id)
          )
        )
      )
    : null;

  const targetZones = combinedZoneTotals(weekTarget.zoneMinutes);
  const plannedZones = combinedZoneTotals(plannedSummary.total.zoneMinutes);
  const completedZones = completedSummary
    ? combinedZoneTotals(completedSummary.total.zoneMinutes)
    : [0, 0, 0, 0, 0];

  const z12Target = (targetZones[0] ?? 0) + (targetZones[1] ?? 0);
  const z12Done = showCompleted
    ? (completedZones[0] ?? 0) + (completedZones[1] ?? 0)
    : (plannedZones[0] ?? 0) + (plannedZones[1] ?? 0);
  const z3PlusTarget = (targetZones[2] ?? 0) + (targetZones[3] ?? 0) + (targetZones[4] ?? 0);
  const z3PlusDone = showCompleted
    ? (completedZones[2] ?? 0) + (completedZones[3] ?? 0) + (completedZones[4] ?? 0)
    : (plannedZones[2] ?? 0) + (plannedZones[3] ?? 0) + (plannedZones[4] ?? 0);

  if (z12Target <= 0 && z3PlusTarget <= 0) return null;

  function bar(done: number, target: number) {
    const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
      </div>
    );
  }

  return (
    <PoolSection
      title="Week TiZ"
      hint={showCompleted ? "Completed vs season target" : "Scheduled vs season target"}
    >
      <div className="space-y-2 text-[11px]">
        {z12Target > 0 ? (
          <div>
            <div className="mb-0.5 flex justify-between tabular-nums text-zinc-600 dark:text-zinc-300">
              <span>Z1–2</span>
              <span>
                {formatZoneMinutes(z12Done)} / {formatZoneMinutes(z12Target)}
              </span>
            </div>
            {bar(z12Done, z12Target)}
          </div>
        ) : null}
        {z3PlusTarget > 0 ? (
          <div>
            <div className="mb-0.5 flex justify-between tabular-nums text-zinc-600 dark:text-zinc-300">
              <span>Z3+</span>
              <span>
                {formatZoneMinutes(z3PlusDone)} / {formatZoneMinutes(z3PlusTarget)}
              </span>
            </div>
            {bar(z3PlusDone, z3PlusTarget)}
          </div>
        ) : null}
      </div>
    </PoolSection>
  );
}

export type WorkoutPoolProps = {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekStart: string;
  currentWeekStart: string;
  selectedDateKey: string | null;
  armedUnscheduled: Record<string, UnscheduledAttachment>;
  onClearArmedUnscheduled: (chipId: string) => void;
  /** When set, show only skeleton (unscheduled) or build (library/TiZ) sections. */
  activeTab?: "skeleton" | "build";
  embedded?: boolean;
};

export function WorkoutPool({
  weekTarget,
  sessions,
  activities,
  weekStart,
  currentWeekStart,
  selectedDateKey,
  armedUnscheduled,
  onClearArmedUnscheduled,
  activeTab,
  embedded = false,
}: WorkoutPoolProps) {
  const unscheduled = useMemo(
    () => computeUnscheduledChips(weekStart, weekTarget, sessions),
    [weekStart, weekTarget, sessions]
  );

  const showSkeleton = activeTab == null || activeTab === "skeleton";
  const showBuild = activeTab == null || activeTab === "build";
  const usesLegacyBudget = !hasUsableTypedSlotBudgets(weekTarget);

  const unscheduledEmptyMessage = usesLegacyBudget
    ? "No typed pool slots for this week. Save the season with recalculate to populate slot budgets."
    : "All budgeted sessions are on the calendar.";

  const inner = (
    <div className="space-y-4">
      {showSkeleton ? (
        <PoolSection
          title="Unscheduled"
          hint={
            selectedDateKey
              ? "Drop a workout on a chip to place on the selected day, or drag a chip to a pool-week day."
              : "Drag a chip to a day in the pool week — you'll pick a session role."
          }
        >
          {unscheduled.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {unscheduled.map((chip) => (
                <UnscheduledChipCard
                  key={chip.id}
                  chip={chip}
                  attachment={armedUnscheduled[chip.id]}
                  selectedDateKey={selectedDateKey}
                  onClearAttachment={onClearArmedUnscheduled}
                />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">{unscheduledEmptyMessage}</p>
          )}
        </PoolSection>
      ) : null}

      {showBuild ? (
        <>
          <PoolSection
            title="Library"
            hint="Saved templates from your workout library. Drag onto a pool-week day or empty session."
          >
            <PoolLibrarySection />
          </PoolSection>

          <WeekTizFooter
            weekTarget={weekTarget}
            sessions={sessions}
            activities={activities}
            weekStart={weekStart}
            currentWeekStart={currentWeekStart}
          />
        </>
      ) : null}
    </div>
  );

  if (embedded) {
    return inner;
  }

  return (
    <aside className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Workout pool</h2>
        {weekTarget.phase ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: weekTarget.phase.color }}
              aria-hidden
            />
            {weekTarget.phase.name}
          </span>
        ) : null}
      </div>
      {inner}
    </aside>
  );
}

/** Title for a flexible session created from an unscheduled chip. */
export function unscheduledSessionTitle(discipline: PoolDiscipline): string {
  return DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline;
}
