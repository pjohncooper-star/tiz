"use client";

import { useMemo } from "react";
import type { PhaseDraft } from "@/components/season/season-settings-types";
import { longWeekBarHeightPercent } from "@/lib/plan/season/long-session-schedule";
import type { ComputedMesocycle } from "@/lib/plan/season/types";

type LongSessionWeekChartProps = {
  phases: PhaseDraft[];
  mesocycles: ComputedMesocycle[];
  totalWeeks: number;
  deLoadWeekFlags: boolean[];
  longRideWeekFlags: boolean[];
  longRunWeekFlags: boolean[];
  weekPreview?: { longRideMinutes: number; longRunMinutes: number }[];
  onToggleRideWeek: (weekIndex: number) => void;
  onToggleRunWeek: (weekIndex: number) => void;
};

function phaseColorByWeek(phases: PhaseDraft[], displayWeeks: number): string[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const colors: string[] = [];
  for (const phase of sorted) {
    for (let w = 0; w < phase.weekCount; w++) {
      colors.push(phase.color);
    }
  }
  const fallback = sorted[sorted.length - 1]?.color ?? "#38bdf8";
  while (colors.length < displayWeeks) colors.push(fallback);
  return colors.slice(0, displayWeeks);
}

type WeekRowProps = {
  label: string;
  weekFlags: boolean[];
  weekColors: string[];
  displayWeeks: number;
  mesocycles: ComputedMesocycle[];
  deLoadWeekFlags: boolean[];
  minutesPreview?: number[];
  onToggleWeek: (weekIndex: number) => void;
};

function LongSessionWeekRow({
  label,
  weekFlags,
  weekColors,
  displayWeeks,
  mesocycles,
  deLoadWeekFlags,
  minutesPreview,
  onToggleWeek,
}: WeekRowProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</p>
      <div className="flex h-20 items-stretch gap-px overflow-hidden rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900/40">
        {Array.from({ length: displayWeeks }, (_, weekIndex) => {
          const isFull = weekFlags[weekIndex] ?? false;
          const isDeLoad = deLoadWeekFlags[weekIndex] ?? false;
          const mesoStart = mesocycles.some(
            (meso) => meso.startWeekIndex === weekIndex && weekIndex > 0
          );
          const minutes = minutesPreview?.[weekIndex];
          const tierLabel = isFull ? "full" : "medium";
          return (
            <button
              key={`${label}-${weekIndex}`}
              type="button"
              onClick={() => onToggleWeek(weekIndex)}
              className={`group flex min-h-0 min-w-[3px] flex-1 flex-col ${
                mesoStart ? "border-l border-zinc-300 dark:border-zinc-600" : ""
              } ${isDeLoad ? "ring-1 ring-inset ring-amber-400/70" : ""} focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
              title={`Week ${weekIndex + 1}: ${tierLabel}${
                minutes != null ? ` · ${minutes} min` : ""
              }${isDeLoad ? " · de-load" : ""} (click to toggle)`}
              aria-label={`Week ${weekIndex + 1}, ${tierLabel} long ${label.toLowerCase()}`}
              aria-pressed={isFull}
            >
              <div className="relative min-h-0 flex-1">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-sm transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${longWeekBarHeightPercent(isFull)}%`,
                    backgroundColor: weekColors[weekIndex] ?? "#38bdf8",
                    opacity: isFull ? 1 : 0.85,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LongSessionWeekChart({
  phases,
  mesocycles,
  totalWeeks,
  deLoadWeekFlags,
  longRideWeekFlags,
  longRunWeekFlags,
  weekPreview,
  onToggleRideWeek,
  onToggleRunWeek,
}: LongSessionWeekChartProps) {
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sortOrder - b.sortOrder),
    [phases]
  );
  const phaseWeekTotal = sortedPhases.reduce((sum, phase) => sum + phase.weekCount, 0);
  const displayWeeks = Math.max(totalWeeks, phaseWeekTotal, 1);
  const weekColors = useMemo(
    () => phaseColorByWeek(sortedPhases, displayWeeks),
    [sortedPhases, displayWeeks]
  );

  if (sortedPhases.length === 0 || displayWeeks <= 0) {
    return <p className="text-sm text-zinc-500">Save cycle structure to see week bars.</p>;
  }

  const showWeekLabels = displayWeeks <= 24;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Long workout schedule
      </p>

      <div className="flex h-8 overflow-hidden rounded-md">
        {sortedPhases.map((phase) => (
          <div
            key={phase.id ?? phase.name}
            className="flex min-w-0 items-center justify-center overflow-hidden text-xs font-medium text-white"
            style={{
              flex: Math.max(phase.weekCount, 0.1),
              backgroundColor: phase.color,
            }}
            title={`${phase.name} (${phase.weekCount}w)`}
          >
            {phase.weekCount >= 2 ? phase.name : ""}
          </div>
        ))}
      </div>

      <div className="relative h-3">
        {mesocycles.map((meso) => {
          const weeksInBlock = meso.endWeekIndex - meso.startWeekIndex + 1;
          const leftPct = (meso.startWeekIndex / displayWeeks) * 100;
          const widthPct = (weeksInBlock / displayWeeks) * 100;
          const phase = sortedPhases[meso.phaseIndex];
          return (
            <div
              key={`${meso.name}-${meso.startWeekIndex}`}
              className="absolute top-0 h-full border-r border-white/40 last:border-r-0 dark:border-zinc-900/60"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: phase?.color ?? "#38bdf8",
                opacity: 0.45,
              }}
              title={`${meso.name} (${weeksInBlock}w)`}
            />
          );
        })}
      </div>

      <LongSessionWeekRow
        label="Long ride"
        weekFlags={longRideWeekFlags}
        weekColors={weekColors}
        displayWeeks={displayWeeks}
        mesocycles={mesocycles}
        deLoadWeekFlags={deLoadWeekFlags}
        minutesPreview={weekPreview?.map((week) => week.longRideMinutes)}
        onToggleWeek={onToggleRideWeek}
      />
      <LongSessionWeekRow
        label="Long run"
        weekFlags={longRunWeekFlags}
        weekColors={weekColors}
        displayWeeks={displayWeeks}
        mesocycles={mesocycles}
        deLoadWeekFlags={deLoadWeekFlags}
        minutesPreview={weekPreview?.map((week) => week.longRunMinutes)}
        onToggleWeek={onToggleRunWeek}
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
        Full weeks fill the bar; medium weeks use 60% height. De-load and taper weeks default to
        medium (amber ring). Click a bar to toggle full vs medium.
      </p>
    </div>
  );
}
