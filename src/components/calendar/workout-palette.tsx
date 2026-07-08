"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import { summarizeWeekPlannedSessions } from "@/lib/plan/calendar/week-summary";
import { seasonPaletteDragId } from "@/lib/plan/workout-builder-dnd";
import {
  formatIntervalLength,
  generateWeekPalette,
  paletteZoneTotal,
  recomputeWorkout,
  type DisciplineBudget,
  type GeneratedWorkout,
} from "@/lib/plan/calendar/generate-workouts";
import {
  formatDurationSeconds,
  parseDurationInput,
} from "@/lib/workout/workout-tree";

const HARD_ZONES = [3, 4, 5] as const;

const DISCIPLINE_LABELS: Record<string, string> = {
  SWIM: "Swim",
  BIKE: "Bike",
  RUN: "Run",
};

const ZONE_TEXT: Record<number, string> = {
  3: "text-amber-700 dark:text-amber-300",
  4: "text-orange-700 dark:text-orange-300",
  5: "text-red-700 dark:text-red-300",
};

function computeBudgets(
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): DisciplineBudget[] {
  const planned = summarizeWeekPlannedSessions(sessions);
  return weekTarget.byDiscipline.map((entry) => {
    const plannedRow = planned.bySport.find((r) => r.discipline === entry.discipline);
    const remainingByZone: Record<number, number> = {};
    for (const zone of HARD_ZONES) {
      const key = `${entry.discipline}-${zone}`;
      const target = entry.zoneMinutes[key] ?? 0;
      const done = plannedRow?.zoneMinutes[key] ?? 0;
      remainingByZone[zone] = Math.max(0, Math.round((target - done) * 10) / 10);
    }
    return {
      discipline: entry.discipline,
      intenseDaysPerWeek: entry.intenseDaysPerWeek,
      remainingByZone,
    };
  });
}

function PaletteCard({
  card,
  onChange,
}: {
  card: GeneratedWorkout;
  onChange: (next: GeneratedWorkout) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: seasonPaletteDragId(card.id),
    data: { type: "season-palette-workout", workout: card },
  });

  const [lengthText, setLengthText] = useState(formatDurationSeconds(card.workLenSeconds));

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[9.5rem] rounded-md border border-zinc-200 bg-white p-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
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

type WorkoutPaletteProps = {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
};

export function WorkoutPalette({ weekTarget, sessions }: WorkoutPaletteProps) {
  const [cards, setCards] = useState<GeneratedWorkout[] | null>(null);

  const budgets = useMemo(
    () => computeBudgets(weekTarget, sessions),
    [weekTarget, sessions]
  );

  const hasBudget = budgets.some((b) =>
    HARD_ZONES.some((z) => (b.remainingByZone[z] ?? 0) > 0.5)
  );

  function handleGenerate() {
    setCards(generateWeekPalette(budgets));
  }

  function updateCard(next: GeneratedWorkout) {
    setCards((prev) => (prev ? prev.map((c) => (c.id === next.id ? next : c)) : prev));
  }

  return (
    <div className="mb-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/70 p-2 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Workout palette
          </span>
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
        <Button type="button" variant="secondary" onClick={handleGenerate}>
          {cards ? "Regenerate" : "Generate week"}
        </Button>
      </div>

      {cards === null ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          {hasBudget
            ? "Generate interval workouts from this week's remaining zone budget, then drag them onto a day or session."
            : "No remaining hard-zone budget this week. Generate to add strides / spin-ups."}
        </p>
      ) : cards.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">
          No workouts to generate for this week.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {weekTarget.byDiscipline.map((entry) => {
            const disciplineCards = cards.filter((c) => c.discipline === entry.discipline);
            if (disciplineCards.length === 0) return null;
            return (
              <div key={entry.discipline}>
                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    {DISCIPLINE_LABELS[entry.discipline] ?? entry.discipline}
                  </span>
                  {HARD_ZONES.map((zone) => {
                    const target = entry.zoneMinutes[`${entry.discipline}-${zone}`] ?? 0;
                    const placed = paletteZoneTotal(cards, entry.discipline, zone);
                    if (target <= 0 && placed <= 0) return null;
                    return (
                      <span key={zone} className={`tabular-nums ${ZONE_TEXT[zone]}`}>
                        Z{zone} {placed}/{Math.round(target)} min
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {disciplineCards.map((card) => (
                    <PaletteCard key={card.id} card={card} onChange={updateCard} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
