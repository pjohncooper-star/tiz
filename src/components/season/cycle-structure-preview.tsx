"use client";

import { useMemo } from "react";
import type { PhaseDraft } from "@/components/season/season-settings-types";
import { resolveMesocycles } from "@/lib/plan/season/phase-split";
import type { SeasonPhaseInput } from "@/lib/plan/season/types";

type CycleStructurePreviewProps = {
  phases: PhaseDraft[];
  mesocycleLengthWeeks: number;
  totalWeeks: number;
};

function toPhaseInput(phases: PhaseDraft[]): SeasonPhaseInput[] {
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => ({
      id: phase.id,
      name: phase.name,
      sortOrder: phase.sortOrder,
      weekCount: phase.weekCount,
      phaseKind: phase.phaseKind,
      color: phase.color,
      focusMode: phase.focusMode,
      phaseFocus: phase.phaseFocus,
      disciplineFocuses: phase.disciplineFocuses,
      mesocycles: phase.mesocycles?.map((m) => ({
        id: m.id,
        name: m.name,
        weekCount: m.weekCount,
      })),
      swimSessionsPerWeek: phase.swimSessionsPerWeek,
      bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
      runSessionsPerWeek: phase.runSessionsPerWeek,
    }));
}

export function CycleStructurePreview({
  phases,
  mesocycleLengthWeeks,
  totalWeeks,
}: CycleStructurePreviewProps) {
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sortOrder - b.sortOrder),
    [phases]
  );

  const mesocycles = useMemo(
    () => resolveMesocycles(toPhaseInput(phases), mesocycleLengthWeeks),
    [phases, mesocycleLengthWeeks]
  );

  const phaseWeekTotal = sortedPhases.reduce((sum, p) => sum + p.weekCount, 0);
  const displayWeeks = Math.max(totalWeeks, phaseWeekTotal, 1);

  if (sortedPhases.length === 0) {
    return <p className="text-sm text-zinc-500">Add phase weeks to see a preview.</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Season preview</p>

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

      <p className="text-xs text-zinc-500">
        {mesocycles
          .map((m) => {
            const weeks = m.endWeekIndex - m.startWeekIndex + 1;
            return `${m.name} (${weeks}w)`;
          })
          .join(" · ")}
      </p>
    </div>
  );
}
