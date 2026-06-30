"use client";

import { useMemo } from "react";
import type { PhaseDraft } from "@/components/season/season-settings-types";
import type { ComputedMesocycle } from "@/lib/plan/season/types";

type DeLoadWeekChartProps = {
  phases: PhaseDraft[];
  mesocycles: ComputedMesocycle[];
  totalWeeks: number;
  deLoadWeekFlags: boolean[];
  deLoadVolumePercent: number;
  onToggleWeek: (weekIndex: number) => void;
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

export function DeLoadWeekChart({
  phases,
  mesocycles,
  totalWeeks,
  deLoadWeekFlags,
  deLoadVolumePercent,
  onToggleWeek,
}: DeLoadWeekChartProps) {
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sortOrder - b.sortOrder),
    [phases]
  );
  const phaseWeekTotal = sortedPhases.reduce((sum, p) => sum + p.weekCount, 0);
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
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Season timeline
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

      <div className="relative">
        <div className="flex h-28 items-stretch gap-px overflow-hidden rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900/40">
          {Array.from({ length: displayWeeks }, (_, weekIndex) => {
            const isDeLoad = deLoadWeekFlags[weekIndex] ?? false;
            const mesoStart = mesocycles.some(
              (m) => m.startWeekIndex === weekIndex && weekIndex > 0
            );
            const barHeightPct = isDeLoad
              ? Math.min(100, Math.max(30, deLoadVolumePercent))
              : 100;
            return (
              <button
                key={weekIndex}
                type="button"
                onClick={() => onToggleWeek(weekIndex)}
                className={`group flex min-h-0 min-w-[3px] flex-1 flex-col ${
                  mesoStart ? "border-l border-zinc-300 dark:border-zinc-600" : ""
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
                title={`Week ${weekIndex + 1}: ${isDeLoad ? "De-load" : "Load"} (click to toggle)`}
                aria-label={`Week ${weekIndex + 1}, ${isDeLoad ? "de-load" : "load"}`}
                aria-pressed={isDeLoad}
              >
                <div className="relative min-h-0 flex-1">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-sm transition-opacity group-hover:opacity-80"
                    style={{
                      height: `${barHeightPct}%`,
                      backgroundColor: weekColors[weekIndex] ?? "#38bdf8",
                      opacity: isDeLoad ? 0.85 : 1,
                    }}
                  />
                </div>
                {showWeekLabels && (
                  <span className="shrink-0 text-center text-[10px] leading-none text-zinc-400">
                    {weekIndex + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        {mesocycles
          .map((m) => {
            const weeks = m.endWeekIndex - m.startWeekIndex + 1;
            return `${m.name} (${weeks}w)`;
          })
          .join(" · ")}
      </p>
      <p className="text-xs text-zinc-500">
        Load weeks fill the bar (100%). De-load weeks use {deLoadVolumePercent}% height. Click a bar
        to toggle.
      </p>
    </div>
  );
}
