"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { computeHardZoneBudgets, hasHardZoneBudget } from "@/lib/plan/calendar/pool-budgets";
import {
  computeUnscheduledChips,
  type PoolDiscipline,
  type UnscheduledChip,
} from "@/lib/plan/calendar/unscheduled-chips";
import {
  combinedZoneTotals,
  linkedActivityIdsExcludedFromCompletedRollup,
  mergeWeekSummaries,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
  summarizeWeekPlannedSessions,
} from "@/lib/plan/calendar/week-summary";
import {
  formatIntervalLength,
  generateWeekPalette,
  paletteZoneTotal,
  recomputeWorkout,
  type GeneratedWorkout,
} from "@/lib/plan/calendar/generate-workouts";
import {
  poolSuggestedDragId,
  poolUnscheduledDragId,
} from "@/lib/plan/workout-builder-dnd";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import {
  formatDurationSeconds,
  parseDurationInput,
} from "@/lib/workout/workout-tree";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";

const HARD_ZONES = [3, 4, 5] as const;

const ZONE_TEXT: Record<number, string> = {
  3: "text-amber-700 dark:text-amber-300",
  4: "text-orange-700 dark:text-orange-300",
  5: "text-red-700 dark:text-red-300",
};

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

function UnscheduledChipCard({ chip }: { chip: UnscheduledChip }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolUnscheduledDragId(chip.id),
    data: { type: "pool-unscheduled", chip },
  });

  return (
    <div
      ref={setNodeRef}
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-zinc-300 bg-white px-2.5 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="font-medium text-zinc-700 dark:text-zinc-200">{chip.label}</span>
      <span className="text-zinc-400">×1</span>
      <button
        type="button"
        className="cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={`Drag unscheduled ${chip.label}`}
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
    </div>
  );
}

function SuggestedCard({
  card,
  onChange,
}: {
  card: GeneratedWorkout;
  onChange: (next: GeneratedWorkout) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolSuggestedDragId(card.id),
    data: { type: "pool-suggested-workout", workout: card },
  });

  const [lengthText, setLengthText] = useState(formatDurationSeconds(card.workLenSeconds));

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-zinc-200 bg-white p-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{card.label}</span>
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
          aria-label={`Drag ${card.label}`}
          {...listeners}
          {...attributes}
        >
          ⠿
        </button>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={40}
          value={card.reps}
          onChange={(e) => onChange(recomputeWorkout(card, { reps: Number(e.target.value) }))}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-11 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
          aria-label="Reps"
        />
        <span className="text-zinc-400">×</span>
        {card.kind === "priming" ? (
          <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
            {formatIntervalLength(card.workLenSeconds)}
          </span>
        ) : (
          <input
            type="text"
            value={lengthText}
            onChange={(e) => setLengthText(e.target.value)}
            onBlur={() => {
              const seconds = parseDurationInput(lengthText);
              if (seconds && seconds > 0) {
                onChange(recomputeWorkout(card, { workLenSeconds: seconds }));
              } else {
                setLengthText(formatDurationSeconds(card.workLenSeconds));
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-14 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            aria-label="Interval length"
          />
        )}
      </div>

      <p className={`mt-1 tabular-nums ${ZONE_TEXT[card.zone] ?? "text-zinc-500"}`}>
        {card.zoneMinutes} min Z{card.zone} · {card.durationMinutes} min total
      </p>
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
};

export function WorkoutPool({
  weekTarget,
  sessions,
  activities,
  weekStart,
  currentWeekStart,
}: WorkoutPoolProps) {
  const unscheduled = useMemo(
    () => computeUnscheduledChips(weekTarget, sessions),
    [weekTarget, sessions]
  );

  const budgets = useMemo(
    () => computeHardZoneBudgets(weekTarget, sessions),
    [weekTarget, sessions]
  );

  const baseSuggested = useMemo(() => generateWeekPalette(budgets), [budgets]);
  const [suggestedOverrides, setSuggestedOverrides] = useState<Record<string, GeneratedWorkout>>(
    {}
  );

  const suggested = useMemo(
    () => baseSuggested.map((card) => suggestedOverrides[card.id] ?? card),
    [baseSuggested, suggestedOverrides]
  );

  const hasSuggested = suggested.length > 0;
  const hasHardBudget = hasHardZoneBudget(budgets);

  function updateSuggested(next: GeneratedWorkout) {
    setSuggestedOverrides((prev) => ({ ...prev, [next.id]: next }));
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

      <div className="space-y-4">
        <PoolSection
          title="Unscheduled"
          hint="Sessions in your weekly budget not yet on the calendar. Drag onto a day."
        >
          {unscheduled.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {unscheduled.map((chip) => (
                <UnscheduledChipCard key={chip.id} chip={chip} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">All budgeted sessions are on the calendar.</p>
          )}
        </PoolSection>

        <PoolSection
          title="Suggested"
          hint="Interval workouts from remaining hard-zone budget. Drag onto a day or session."
        >
          {hasSuggested ? (
            <div className="space-y-2">
              {weekTarget.byDiscipline.map((entry) => {
                const disciplineCards = suggested.filter((card) => card.discipline === entry.discipline);
                if (disciplineCards.length === 0) return null;
                return (
                  <div key={entry.discipline}>
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        {entry.discipline.charAt(0) + entry.discipline.slice(1).toLowerCase()}
                      </span>
                      {HARD_ZONES.map((zone) => {
                        const key = `${entry.discipline}-${zone}`;
                        const target = entry.zoneMinutes[key] ?? 0;
                        const placed = paletteZoneTotal(suggested, entry.discipline, zone);
                        if (target <= 0 && placed <= 0) return null;
                        return (
                          <span key={zone} className={`tabular-nums ${ZONE_TEXT[zone]}`}>
                            Z{zone} {placed}/{Math.round(target)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="space-y-1.5">
                      {disciplineCards.map((card) => (
                        <SuggestedCard key={card.id} card={card} onChange={updateSuggested} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              {hasHardBudget
                ? "No suggested workouts for this week."
                : "Hard-zone budget is filled. Strides and spin-ups appear when you have room."}
            </p>
          )}
        </PoolSection>

        <PoolSection title="Library" hint="Saved workout templates (sidebar browse — coming next).">
          <p className="text-[11px] text-zinc-500">
            Browse and drag templates from{" "}
            <Link href="/plan/library" className="text-sky-600 hover:underline dark:text-sky-400">
              Plan → Library
            </Link>
            . In-pool folder tree is planned for the next iteration.
          </p>
        </PoolSection>

        <WeekTizFooter
          weekTarget={weekTarget}
          sessions={sessions}
          activities={activities}
          weekStart={weekStart}
          currentWeekStart={currentWeekStart}
        />
      </div>
    </aside>
  );
}

/** Title for a flexible session created from an unscheduled chip. */
export function unscheduledSessionTitle(discipline: PoolDiscipline): string {
  return DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline;
}
