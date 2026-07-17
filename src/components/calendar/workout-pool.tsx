"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  computeUnscheduledChips,
  formatChipDurationMinutes,
  hasUsableTypedSlotBudgets,
  type PoolDiscipline,
  type UnscheduledChip,
} from "@/lib/plan/calendar/unscheduled-chips";
import {
  filterPoolCards,
  isEndurancePoolDiscipline,
  mergeChipsWithDrafts,
  type PoolCardDraftMap,
  type PoolDisciplineFilter,
  type PoolSessionCard,
} from "@/lib/plan/calendar/pool-session-card";
import {
  combinedZoneTotals,
  linkedActivityIdsExcludedFromCompletedRollup,
  mergeWeekSummaries,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
  summarizeWeekPlannedSessions,
} from "@/lib/plan/calendar/week-summary";
import { poolSessionCardDragId } from "@/lib/plan/workout-builder-dnd";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";
import { SessionRoleBadge } from "@/components/calendar/session-role-badge";
import { sessionRoleForChip } from "@/lib/plan/calendar/session-role-for-chip";

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

const SLOT_KIND_SHORT: Record<UnscheduledChip["slotKind"], string> = {
  ENDURANCE: "Endurance",
  INTENSITY: "Intense",
  LONG: "Long",
  SUBSTITUTE_ENDURANCE: "Endurance (sub)",
};

function PoolSessionCardView({
  card,
  selected,
  onSelect,
}: {
  card: PoolSessionCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const canBuild = isEndurancePoolDiscipline(card.discipline);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: poolSessionCardDragId(card.id),
    data: {
      type: "pool-session-card",
      chip: card,
      draft: card.draft ?? null,
    },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const durationLabel = card.draft
    ? formatChipDurationMinutes(card.draft.durationMinutes)
    : card.targetDurationMinutes != null && card.targetDurationMinutes > 0
      ? formatChipDurationMinutes(card.targetDurationMinutes)
      : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full max-w-[11rem] rounded-md border bg-white p-2 text-xs shadow-sm dark:bg-zinc-900 ${
        selected
          ? "border-sky-400 ring-2 ring-sky-400/40 dark:border-sky-500"
          : "border-zinc-200 dark:border-zinc-700"
      } ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          if (canBuild) onSelect();
        }}
        disabled={!canBuild}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">
              {DISCIPLINE_DISPLAY_LABELS[card.discipline] ?? card.discipline}
            </p>
            <p className="truncate text-[10px] text-zinc-400">{SLOT_KIND_SHORT[card.slotKind]}</p>
          </div>
          <SessionRoleBadge role={sessionRoleForChip(card)} />
        </div>
        {card.draft?.profile ? (
          <div className="mt-1.5">
            <WorkoutProfileMiniChart profile={card.draft.profile} />
          </div>
        ) : (
          <div className="mt-1.5 flex h-8 items-center justify-center rounded bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-800">
            {canBuild ? "Click to build" : "Drag to day"}
          </div>
        )}
        {durationLabel ? (
          <p className="mt-1 tabular-nums text-[10px] text-zinc-500">{durationLabel}</p>
        ) : null}
      </button>
      <button
        type="button"
        className="mt-1 w-full cursor-grab touch-none rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-50 active:cursor-grabbing dark:border-zinc-700 dark:hover:bg-zinc-800"
        aria-label={`Drag ${card.label} to calendar`}
        {...listeners}
        {...attributes}
      >
        Drag to calendar
      </button>
    </div>
  );
}

function DisciplineFilterBar({
  value,
  onChange,
}: {
  value: PoolDisciplineFilter;
  onChange: (v: PoolDisciplineFilter) => void;
}) {
  const options: { value: PoolDisciplineFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "SWIM", label: "Swim" },
    { value: "BIKE", label: "Bike" },
    { value: "RUN", label: "Run" },
    { value: "STRENGTH", label: "Strength" },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
            value === opt.value
              ? "bg-sky-600 text-white"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
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
  drafts: PoolCardDraftMap;
  disciplineFilter: PoolDisciplineFilter;
  onDisciplineFilterChange: (filter: PoolDisciplineFilter) => void;
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  embedded?: boolean;
};

export function WorkoutPool({
  weekTarget,
  sessions,
  activities,
  weekStart,
  currentWeekStart,
  drafts,
  disciplineFilter,
  onDisciplineFilterChange,
  selectedCardId,
  onSelectCard,
  embedded = false,
}: WorkoutPoolProps) {
  const chips = useMemo(
    () => computeUnscheduledChips(weekStart, weekTarget, sessions),
    [weekStart, weekTarget, sessions]
  );

  const cards = useMemo(
    () => filterPoolCards(mergeChipsWithDrafts(chips, drafts), disciplineFilter),
    [chips, drafts, disciplineFilter]
  );

  const usesLegacyBudget = !hasUsableTypedSlotBudgets(weekTarget);

  const emptyMessage = usesLegacyBudget
    ? "No typed pool slots for this week. Save the season with recalculate to populate slot budgets."
    : chips.length === 0
      ? "All budgeted sessions are on the calendar."
      : "No cards match this discipline filter.";

  const inner = (
    <div className="space-y-3">
      <DisciplineFilterBar value={disciplineFilter} onChange={onDisciplineFilterChange} />

      <PoolSection
        title="Session cards"
        hint="Select a card to build a workout, then drag it onto a pool-week day."
      >
        {cards.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <PoolSessionCardView
                key={card.id}
                card={card}
                selected={selectedCardId === card.id}
                onSelect={() => onSelectCard(card.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500">{emptyMessage}</p>
        )}
      </PoolSection>

      <WeekTizFooter
        weekTarget={weekTarget}
        sessions={sessions}
        activities={activities}
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
      />
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
