"use client";

import { format } from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";
import type { GoalEventDraft, PhaseDraft } from "@/components/season/season-settings-types";
import { parseDateKey } from "@/lib/dates";
import { buildPreviewRaceMarkers } from "@/lib/plan/season/preview-race-markers";
import { RaceMarkerOverlay } from "@/components/season/race-marker-overlay";
import { SeasonMonthTicks } from "@/components/season/season-month-ticks";
import {
  monthTicksForWeeks,
  weekStartDateForIndex,
} from "@/lib/plan/season/season-dates";
import { phaseStartWeekIndices } from "@/lib/plan/season/phase-boundary-resize";
import { resolveMesocycles } from "@/lib/plan/season/phase-split";
import type { SeasonPhaseInput } from "@/lib/plan/season/types";

type CycleStructurePreviewProps = {
  phases: PhaseDraft[];
  mesocycleLengthWeeks: number;
  totalWeeks: number;
  startDate?: string;
  aRace?: GoalEventDraft | null;
  bRaces?: GoalEventDraft[];
  cRaces?: GoalEventDraft[];
  onResizeBoundary?: (boundaryIndex: number, boundaryWeekIndex: number) => void;
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
  startDate,
  aRace,
  bRaces = [],
  cRaces = [],
  onResizeBoundary,
}: CycleStructurePreviewProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingBoundary, setDraggingBoundary] = useState<number | null>(null);

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
  const weekCounts = sortedPhases.map((phase) => phase.weekCount);
  const phaseStarts = useMemo(() => phaseStartWeekIndices(weekCounts), [weekCounts]);

  const boundaryWeekIndices = useMemo(() => {
    const boundaries: number[] = [];
    for (let index = 0; index < sortedPhases.length - 1; index++) {
      boundaries.push(phaseStarts[index]! + sortedPhases[index]!.weekCount);
    }
    return boundaries;
  }, [phaseStarts, sortedPhases]);

  const seasonStart = useMemo(
    () => (startDate ? parseDateKey(startDate) : null),
    [startDate]
  );

  const monthTicks = useMemo(() => {
    if (!seasonStart) return [];
    return monthTicksForWeeks(seasonStart, displayWeeks);
  }, [displayWeeks, seasonStart]);

  const raceMarkers = useMemo(() => {
    if (!seasonStart) return [];
    return buildPreviewRaceMarkers(seasonStart, displayWeeks, aRace, bRaces, cRaces);
  }, [aRace, bRaces, cRaces, displayWeeks, seasonStart]);

  const weekIndexFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.round(ratio * displayWeeks);
    },
    [displayWeeks]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (draggingBoundary === null || !onResizeBoundary) return;
      onResizeBoundary(draggingBoundary, weekIndexFromPointer(event.clientX));
    },
    [draggingBoundary, onResizeBoundary, weekIndexFromPointer]
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingBoundary(null);
  }, []);

  if (sortedPhases.length === 0) {
    return <p className="text-sm text-zinc-500">Add phase weeks to see a preview.</p>;
  }

  const showWeekLabels = displayWeeks <= 24;
  const interactive = Boolean(onResizeBoundary && sortedPhases.length > 1);

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Season preview</p>

      <RaceMarkerOverlay markers={raceMarkers} />

      <div
        ref={trackRef}
        className="relative select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex h-8 overflow-hidden rounded-md">
          {sortedPhases.map((phase, index) => {
            const phaseStart = phaseStarts[index] ?? 0;
            const phaseStartLabel =
              seasonStart != null
                ? format(weekStartDateForIndex(seasonStart, phaseStart), "MMM d")
                : null;
            return (
              <div
                key={phase.id ?? phase.name}
                className="relative flex min-w-0 items-center justify-center overflow-hidden text-xs font-medium text-white"
                style={{
                  flex: Math.max(phase.weekCount, 0.1),
                  backgroundColor: phase.color,
                }}
                title={`${phase.name} (${phase.weekCount}w)${
                  phaseStartLabel ? ` · ${phaseStartLabel}` : ""
                }`}
              >
                {phase.weekCount >= 2 ? phase.name : ""}
              </div>
            );
          })}
        </div>

        {interactive &&
          boundaryWeekIndices.map((boundaryWeekIndex, boundaryIndex) => (
            <button
              key={`boundary-${boundaryIndex}`}
              type="button"
              aria-label={`Resize between ${sortedPhases[boundaryIndex]?.name ?? "phase"} and ${
                sortedPhases[boundaryIndex + 1]?.name ?? "phase"
              }`}
              className={`absolute top-0 z-10 h-8 w-3 -translate-x-1/2 touch-none rounded-sm border border-white/70 bg-white/20 shadow-sm backdrop-blur-sm transition hover:bg-white/35 dark:border-zinc-900/70 ${
                draggingBoundary === boundaryIndex ? "bg-white/50" : ""
              }`}
              style={{
                left: `${(boundaryWeekIndex / displayWeeks) * 100}%`,
                cursor: "col-resize",
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggingBoundary(boundaryIndex);
              }}
            />
          ))}
      </div>

      {seasonStart != null && (
        <div className="relative h-4 text-[10px] text-zinc-500">
          {sortedPhases.map((phase, index) => {
            const phaseStart = phaseStarts[index] ?? 0;
            return (
              <span
                key={`${phase.id ?? phase.name}-start`}
                className="absolute top-0 whitespace-nowrap"
                style={{ left: `${(phaseStart / displayWeeks) * 100}%` }}
              >
                {format(weekStartDateForIndex(seasonStart, phaseStart), "MMM d")}
                {phase.weekCount >= 2 && (
                  <span className="ml-1 hidden sm:inline">· {phase.name}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {!seasonStart && showWeekLabels && (
        <div className="relative h-4 text-[10px] text-zinc-500">
          {Array.from({ length: displayWeeks }, (_, weekIndex) => (
            <span
              key={weekIndex}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${((weekIndex + 0.5) / displayWeeks) * 100}%` }}
            >
              {weekIndex + 1}
            </span>
          ))}
        </div>
      )}

      {seasonStart != null && monthTicks.length > 0 && (
        <SeasonMonthTicks ticks={monthTicks} displayWeeks={displayWeeks} />
      )}

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
        {interactive
          ? "Drag phase dividers to adjust week lengths. Total weeks stay fixed."
          : null}
        {interactive && mesocycles.length > 0 ? " " : null}
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
