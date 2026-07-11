"use client";

import { useMemo } from "react";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import { longWeekBarHeightPercent } from "@/lib/plan/season/long-session-schedule";
import {
  longWeekFlagsFromSimplePhases,
  recalculateSimpleLongSessions,
  type SimpleLongSessionDefaults,
} from "@/lib/plan/season/simple-long-session";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";

type SimpleLongSessionChartProps = {
  phases: SimplePhase[];
  totalWeeks: number;
  weeks: Array<{ weekIndex: number; isRestWeek: boolean }>;
  longDefaults: SimpleLongSessionDefaults;
  rampDefaults: SimpleRampDefaults;
};

function phaseColorByWeek(phases: SimplePhase[], totalWeeks: number): string[] {
  const colors: string[] = [];
  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const phase = phases.find(
      (item) =>
        weekIndex >= item.startWeekIndex && weekIndex <= item.endWeekIndex
    );
    colors.push(phase?.color ?? "#94a3b8");
  }
  return colors;
}

function LongSessionRow({
  label,
  weekFlags,
  weekColors,
  displayWeeks,
  deLoadWeekFlags,
  minutesPreview,
}: {
  label: string;
  weekFlags: boolean[];
  weekColors: string[];
  displayWeeks: number;
  deLoadWeekFlags: boolean[];
  minutesPreview?: number[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</p>
      <div className="flex h-20 items-stretch gap-px overflow-hidden rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900/40">
        {Array.from({ length: displayWeeks }, (_, weekIndex) => {
          const isFull = weekFlags[weekIndex] ?? false;
          const isDeLoad = deLoadWeekFlags[weekIndex] ?? false;
          const minutes = minutesPreview?.[weekIndex];
          const tierLabel = isFull ? "full" : minutes === 0 ? "none" : "medium";
          return (
            <div
              key={`${label}-${weekIndex}`}
              className={`flex min-h-0 min-w-[3px] flex-1 flex-col ${
                isDeLoad ? "ring-1 ring-inset ring-amber-400/70" : ""
              }`}
              title={`Week ${weekIndex + 1}: ${tierLabel}${
                minutes != null ? ` · ${minutes} min` : ""
              }${isDeLoad ? " · recovery" : ""}`}
            >
              <div className="relative min-h-0 flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-sm"
                  style={{
                    height: `${minutes === 0 ? 0 : longWeekBarHeightPercent(isFull)}%`,
                    backgroundColor: weekColors[weekIndex] ?? "#38bdf8",
                    opacity: isFull ? 1 : 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SimpleLongSessionChart({
  phases,
  totalWeeks,
  weeks,
  longDefaults,
  rampDefaults,
}: SimpleLongSessionChartProps) {
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.startWeekIndex - b.startWeekIndex),
    [phases]
  );
  const displayWeeks = Math.max(totalWeeks, 1);
  const weekColors = useMemo(
    () => phaseColorByWeek(sortedPhases, displayWeeks),
    [sortedPhases, displayWeeks]
  );
  const { longRideWeekFlags, longRunWeekFlags } = useMemo(
    () => longWeekFlagsFromSimplePhases(sortedPhases, weeks),
    [sortedPhases, weeks]
  );
  const weekPreview = useMemo(
    () =>
      recalculateSimpleLongSessions({
        weeks,
        phases: sortedPhases,
        longDefaults,
        rampDefaults,
      }),
    [weeks, sortedPhases, longDefaults, rampDefaults]
  );
  const deLoadWeekFlags = useMemo(
    () => weeks.map((week) => week.isRestWeek),
    [weeks]
  );

  if (sortedPhases.length === 0) {
    return <p className="text-sm text-zinc-500">Add phases to preview long sessions.</p>;
  }

  const showWeekLabels = displayWeeks <= 24;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Long workout schedule
      </p>

      <div className="flex h-8 overflow-hidden rounded-md">
        {sortedPhases.map((phase) => {
          const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
          return (
            <div
              key={phase.id ?? phase.name}
              className="flex min-w-0 items-center justify-center overflow-hidden text-xs font-medium text-white"
              style={{
                flex: Math.max(weekCount, 0.1),
                backgroundColor: phase.color,
              }}
              title={`${phase.name} (${weekCount}w)`}
            >
              {weekCount >= 2 ? phase.name : ""}
            </div>
          );
        })}
      </div>

      <LongSessionRow
        label="Long ride"
        weekFlags={longRideWeekFlags}
        weekColors={weekColors}
        displayWeeks={displayWeeks}
        deLoadWeekFlags={deLoadWeekFlags}
        minutesPreview={weekPreview.map((week) => week.longRideMinutes)}
      />
      <LongSessionRow
        label="Long run"
        weekFlags={longRunWeekFlags}
        weekColors={weekColors}
        displayWeeks={displayWeeks}
        deLoadWeekFlags={deLoadWeekFlags}
        minutesPreview={weekPreview.map((week) => week.longRunMinutes)}
      />

      {showWeekLabels && (
        <div className="flex gap-px px-1">
          {Array.from({ length: displayWeeks }, (_, weekIndex) => (
            <span
              key={weekIndex}
              className="min-w-[3px] flex-1 text-center text-[10px] leading-none text-zinc-400"
            >
              {weekIndex + 1}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Full weeks fill the bar; recovery weeks use 60% height. Taper and none-cadence phases show
        no long session. Cadence is set per phase under Phases.
      </p>
    </div>
  );
}
