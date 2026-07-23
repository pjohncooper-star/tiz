"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Discipline, PlanningMode } from "@prisma/client";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { computeEffectiveScheduledTiz } from "@/lib/plan/calendar/effective-scheduled-tiz";
import type { PaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import type { WorkoutNode } from "@/lib/workout/workout-tree";
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
  sportZoneTotals,
} from "@/lib/plan/calendar/week-summary";
import { poolSessionCardDragId } from "@/lib/plan/workout-builder-dnd";
import type { CalendarWeekTarget, TargetDiscipline } from "@/components/calendar/types";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  canAutoFillEasyTiz,
} from "@/lib/plan/calendar/spread-easy-tiz";
import { planningModeIncludesLongTiz } from "@/lib/plan/season/planning-mode";
import { formatSessionDistance } from "@/lib/workout/metrics";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";
import { SessionRoleBadge } from "@/components/calendar/session-role-badge";
import { sessionRoleForChip } from "@/lib/plan/calendar/session-role-for-chip";

const TIZ_ZONES = [1, 2, 3, 4, 5] as const;
const TIZ_DISCIPLINES: TargetDiscipline[] = ["SWIM", "BIKE", "RUN"];
const LONG_TIZ_DISCIPLINES = ["BIKE", "RUN"] as const;

const ZONE_BAR_COLORS: Record<number, string> = {
  1: "bg-sky-200 dark:bg-sky-900",
  2: "bg-sky-400 dark:bg-sky-700",
  3: "bg-amber-400 dark:bg-amber-700",
  4: "bg-orange-500 dark:bg-orange-700",
  5: "bg-red-500 dark:bg-red-700",
};

function zoneArrayHasTarget(zones: number[]): boolean {
  return zones.some((minutes) => minutes > 0);
}

function ZoneProgressRows({
  targetZones,
  scheduledZones,
}: {
  targetZones: number[];
  scheduledZones: number[];
}) {
  return (
    <div className="space-y-1.5">
      {TIZ_ZONES.map((zone) => {
        const target = targetZones[zone - 1] ?? 0;
        if (target <= 0) return null;
        const scheduled = scheduledZones[zone - 1] ?? 0;
        const pct = Math.min(100, Math.round((scheduled / target) * 100));
        return (
          <div key={zone}>
            <div className="mb-0.5 flex justify-between tabular-nums text-zinc-600 dark:text-zinc-300">
              <span>Z{zone}</span>
              <span>
                {formatZoneMinutes(scheduled)} / {formatZoneMinutes(target)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full ${ZONE_BAR_COLORS[zone] ?? "bg-sky-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function scheduledZonesFromRollup(
  zoneMinutes: Record<string, number>,
  discipline?: Discipline
): number[] {
  if (discipline) return sportZoneTotals(discipline, zoneMinutes);
  return combinedZoneTotals(zoneMinutes);
}

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

function poolCardDurationLabel(card: PoolSessionCard): string | null {
  if (card.draft) return formatChipDurationMinutes(card.draft.durationMinutes);
  if (card.targetDurationMinutes != null && card.targetDurationMinutes > 0) {
    return formatChipDurationMinutes(card.targetDurationMinutes);
  }
  return null;
}

function poolCardDistanceLabel(card: PoolSessionCard): string | null {
  if (card.draft?.distanceMeters != null && card.draft.distanceMeters > 0) {
    return formatSessionDistance(card.draft.distanceMeters, card.discipline, "METRIC");
  }
  return null;
}

function PoolSessionCardBody({ card }: { card: PoolSessionCard }) {
  const canBuild = isEndurancePoolDiscipline(card.discipline);
  const durationLabel = poolCardDurationLabel(card);
  const distanceLabel = poolCardDistanceLabel(card);

  return (
    <>
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
      {durationLabel || distanceLabel ? (
        <p className="mt-1 tabular-nums text-[10px] text-zinc-500">
          {[durationLabel, distanceLabel].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </>
  );
}

/** Presentational pool card for DragOverlay (pointer follows outside overflow panes). */
export function PoolSessionCardPreview({
  card,
  selected = false,
}: {
  card: PoolSessionCard;
  selected?: boolean;
}) {
  return (
    <div
      className={`w-full max-w-[11rem] rounded-md border bg-white p-2 text-xs shadow-lg dark:bg-zinc-900 ${
        selected
          ? "border-sky-400 ring-2 ring-sky-400/40 dark:border-sky-500"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <PoolSessionCardBody card={card} />
    </div>
  );
}

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
  // Do not apply CSS transform on the source — it lives inside overflow-y-auto and
  // would clip the drag + autoscroll the pool pane. Visual follows via DragOverlay.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolSessionCardDragId(card.id),
    data: {
      type: "pool-session-card",
      chip: card,
      draft: card.draft ?? null,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-full max-w-[11rem] rounded-md border bg-white p-2 text-xs shadow-sm dark:bg-zinc-900 ${
        selected
          ? "border-sky-400 ring-2 ring-sky-400/40 dark:border-sky-500"
          : "border-zinc-200 dark:border-zinc-700"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          if (canBuild) onSelect();
        }}
        disabled={!canBuild}
      >
        <PoolSessionCardBody card={card} />
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
  onAutoFillEasyTiz,
  showAutoFill,
}: {
  value: PoolDisciplineFilter;
  onChange: (v: PoolDisciplineFilter) => void;
  onAutoFillEasyTiz?: () => void;
  showAutoFill?: boolean;
}) {
  const options: { value: PoolDisciplineFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "SWIM", label: "Swim" },
    { value: "BIKE", label: "Bike" },
    { value: "RUN", label: "Run" },
    { value: "STRENGTH", label: "Strength" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
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
      {showAutoFill && onAutoFillEasyTiz ? (
        <button
          type="button"
          className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-950/70"
          onClick={onAutoFillEasyTiz}
          title="Fill remaining Z1/Z2 onto easy/long Build sessions and apply workouts to the calendar"
        >
          Auto-fill easy TiZ
        </button>
      ) : null}
    </div>
  );
}

function WeekTizFooter({
  weekTarget,
  sessions,
  drafts,
  chips,
  disciplineFilter,
  paceContext,
  liveOverlay,
}: {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  drafts: PoolCardDraftMap;
  chips: UnscheduledChip[];
  disciplineFilter: PoolDisciplineFilter;
  paceContext?: PaceThresholdContext | null;
  liveOverlay?: {
    cardId: string;
    nodes: WorkoutNode[];
    discipline: Discipline;
  } | null;
}) {
  const mode: PlanningMode = weekTarget.planningMode ?? "BY_DISCIPLINE";
  const separateLongTiz = planningModeIncludesLongTiz(mode);
  const showOverall = mode === "OVERALL";

  // Strength has no TiZ; hide the footer when that filter is active.
  if (disciplineFilter === "STRENGTH") return null;

  const filteredDiscipline: TargetDiscipline | null =
    disciplineFilter === "SWIM" ||
    disciplineFilter === "BIKE" ||
    disciplineFilter === "RUN"
      ? disciplineFilter
      : null;

  const effectiveScheduled = computeEffectiveScheduledTiz({
    weekTarget,
    sessions,
    drafts,
    chips,
    paceContext,
    liveOverlay,
  });

  const overallTarget = combinedZoneTotals(weekTarget.zoneMinutes);
  const visibleDisciplines = filteredDiscipline
    ? TIZ_DISCIPLINES.filter((d) => d === filteredDiscipline)
    : TIZ_DISCIPLINES;
  const disciplineColumns = visibleDisciplines
    .map((discipline) => {
      const entry = weekTarget.byDiscipline.find((row) => row.discipline === discipline);
      const target = sportZoneTotals(discipline, entry?.zoneMinutes ?? {});
      return {
        discipline,
        target,
        scheduled: scheduledZonesFromRollup(effectiveScheduled.main, discipline),
      };
    })
    .filter((row) => zoneArrayHasTarget(row.target));

  const longTargetByDiscipline = LONG_TIZ_DISCIPLINES.filter(
    (discipline) => !filteredDiscipline || discipline === filteredDiscipline
  )
    .map((discipline) => ({
      discipline,
      target: sportZoneTotals(discipline, weekTarget.longSessionZoneMinutes ?? {}),
      scheduled: scheduledZonesFromRollup(effectiveScheduled.long, discipline),
    }))
    .filter((row) => zoneArrayHasTarget(row.target));

  const hasLongTarget = separateLongTiz && longTargetByDiscipline.length > 0;
  const hasMainTarget = showOverall
    ? zoneArrayHasTarget(overallTarget)
    : disciplineColumns.length > 0;
  if (!hasMainTarget && !hasLongTarget) return null;

  const columnCount = Math.max(1, disciplineColumns.length);

  return (
    <PoolSection title="Week TiZ" hint="Scheduled vs season target">
      <div className="space-y-3 text-[11px]">
        {showOverall ? (
          <ZoneProgressRows
            targetZones={overallTarget}
            scheduledZones={scheduledZonesFromRollup(effectiveScheduled.main)}
          />
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {disciplineColumns.map(({ discipline, target, scheduled }) => (
              <div key={discipline} className="min-w-0 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline}
                </p>
                <ZoneProgressRows targetZones={target} scheduledZones={scheduled} />
              </div>
            ))}
          </div>
        )}

        {hasLongTarget ? (
          <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Long
            </p>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, longTargetByDiscipline.length)}, minmax(0, 1fr))`,
              }}
            >
              {longTargetByDiscipline.map(({ discipline, target, scheduled }) => (
                <div key={`long-${discipline}`} className="min-w-0 space-y-1">
                  <p className="text-[10px] font-medium text-zinc-500">
                    {DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline}
                  </p>
                  <ZoneProgressRows targetZones={target} scheduledZones={scheduled} />
                </div>
              ))}
            </div>
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
  onAutoFillEasyTiz?: () => void;
  paceContext?: PaceThresholdContext | null;
  liveOverlay?: {
    cardId: string;
    nodes: WorkoutNode[];
    discipline: Discipline;
  } | null;
  /** When set, render only session cards or Week TiZ (default all). */
  section?: "all" | "cards" | "tiz";
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
  onAutoFillEasyTiz,
  paceContext,
  liveOverlay,
  section = "all",
}: WorkoutPoolProps) {
  const chips = useMemo(
    () => computeUnscheduledChips(weekStart, weekTarget, sessions),
    [weekStart, weekTarget, sessions]
  );

  const showAutoFill = useMemo(
    () =>
      canAutoFillEasyTiz({
        chips,
        sessions,
        drafts,
        disciplineFilter,
      }),
    [chips, sessions, drafts, disciplineFilter]
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

  const cardsSection = (
    <>
      <DisciplineFilterBar
        value={disciplineFilter}
        onChange={onDisciplineFilterChange}
        onAutoFillEasyTiz={onAutoFillEasyTiz}
        showAutoFill={showAutoFill}
      />

      <PoolSection
        title="Session cards"
        hint="Select a card to build a workout, then drag it onto a pool-week day."
      >
        {cards.length > 0 ? (
          <div className="flex flex-col gap-2">
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
    </>
  );

  const tizSection = (
    <WeekTizFooter
      weekTarget={weekTarget}
      sessions={sessions}
      drafts={drafts}
      chips={chips}
      disciplineFilter={disciplineFilter}
      paceContext={paceContext}
      liveOverlay={liveOverlay}
    />
  );

  if (section === "cards") {
    return embedded ? cardsSection : <div className="space-y-3">{cardsSection}</div>;
  }

  if (section === "tiz") {
    return embedded ? tizSection : <div className="space-y-3">{tizSection}</div>;
  }

  const inner = (
    <div className="space-y-3">
      {cardsSection}
      {tizSection}
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
