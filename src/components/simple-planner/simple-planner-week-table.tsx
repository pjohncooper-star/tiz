"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import {
  createPhaseAtWeek,
  type SimplePhase,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { formatWeekDateRange } from "@/components/simple-planner/simple-planner-timeline";
import {
  buildGutterSegments,
  phaseForWeekIndex,
  resizePhaseBottom,
  resizePhaseTop,
  weekIsAssigned,
} from "@/lib/plan/season/phase-span-utils";

type SimplePlannerWeekTableProps = {
  weeks: SimpleWeek[];
  phases: SimplePhase[];
  selectedPhaseId: string | null;
  onSelectPhase: (phaseId: string | null) => void;
  onWeeksChange: (weeks: SimpleWeek[]) => void;
  onPhasesChange: (phases: SimplePhase[]) => void;
  highlightedWeekIndex: number | null;
};

type DragState = {
  phaseId: string;
  edge: "top" | "bottom";
};

type DragPreview = {
  phaseId: string;
  startWeekIndex: number;
  endWeekIndex: number;
};

const DISCIPLINES = [
  { key: "swimHours" as const, label: "Swim" },
  { key: "bikeHours" as const, label: "Bike" },
  { key: "runHours" as const, label: "Run" },
];

function weekIndexFromPointer(clientY: number): number | null {
  const rows = document.querySelectorAll<HTMLTableRowElement>("tbody tr[data-week-index]");
  let nearest: { weekIndex: number; distance: number } | null = null;

  for (const row of rows) {
    const weekIndex = Number(row.dataset.weekIndex);
    if (Number.isNaN(weekIndex)) continue;

    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return weekIndex;
    }

    const distance =
      clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (!nearest || distance < nearest.distance) {
      nearest = { weekIndex, distance };
    }
  }

  return nearest?.weekIndex ?? null;
}

export function SimplePlannerWeekTable({
  weeks,
  phases,
  selectedPhaseId,
  onSelectPhase,
  onWeeksChange,
  onPhasesChange,
  highlightedWeekIndex,
}: SimplePlannerWeekTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const phasesRef = useRef(phases);
  phasesRef.current = phases;
  const weeksLengthRef = useRef(weeks.length);
  weeksLengthRef.current = weeks.length;
  const dragPreviewRef = useRef(dragPreview);
  dragPreviewRef.current = dragPreview;

  const displayPhases = useMemo(() => {
    if (!dragPreview) return phases;
    return phases.map((phase) =>
      phase.id === dragPreview.phaseId
        ? {
            ...phase,
            startWeekIndex: dragPreview.startWeekIndex,
            endWeekIndex: dragPreview.endWeekIndex,
          }
        : phase
    );
  }, [dragPreview, phases]);

  const gutterSegments = useMemo(
    () => buildGutterSegments(weeks, displayPhases),
    [displayPhases, weeks]
  );

  const toggleExpanded = useCallback((weekIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(weekIndex)) next.delete(weekIndex);
      else next.add(weekIndex);
      return next;
    });
  }, []);

  const updateWeek = useCallback(
    (weekIndex: number, patch: Partial<SimpleWeek>) => {
      onWeeksChange(
        weeks.map((week) => {
          if (week.weekIndex !== weekIndex) return week;
          const swimHours = patch.swimHours ?? week.swimHours;
          const bikeHours = patch.bikeHours ?? week.bikeHours;
          const runHours = patch.runHours ?? week.runHours;
          return {
            ...week,
            ...patch,
            swimHours,
            bikeHours,
            runHours,
            totalHours: round(swimHours + bikeHours + runHours),
          };
        })
      );
    },
    [onWeeksChange, weeks]
  );

  const addPhaseAtWeek = useCallback(
    (weekIndex: number) => {
      if (weekIsAssigned(phases, weekIndex)) return;
      const next = createPhaseAtWeek(weekIndex, phases.length + 1);
      onPhasesChange([...phases, next]);
      onSelectPhase(next.id ?? null);
    },
    [onPhasesChange, onSelectPhase, phases]
  );

  const applyDragAtWeek = useCallback((pointerWeek: number, drag: DragState) => {
    const phase = phasesRef.current.find((item) => item.id === drag.phaseId);
    if (!phase) return;

    const resized =
      drag.edge === "top"
        ? resizePhaseTop(phase, phasesRef.current, weeksLengthRef.current, pointerWeek)
        : resizePhaseBottom(phase, phasesRef.current, weeksLengthRef.current, pointerWeek);

    setDragPreview({
      phaseId: drag.phaseId,
      startWeekIndex: resized.startWeekIndex,
      endWeekIndex: resized.endWeekIndex,
    });
  }, []);

  const startDrag = useCallback(
    (phaseId: string, edge: "top" | "bottom", clientY: number) => {
      const drag = { phaseId, edge };
      setDragging(drag);
      const pointerWeek = weekIndexFromPointer(clientY);
      if (pointerWeek !== null) {
        applyDragAtWeek(pointerWeek, drag);
      }
    },
    [applyDragAtWeek]
  );

  useEffect(() => {
    if (!dragging) return;
    const activeDrag = dragging;

    function finishDrag() {
      const preview = dragPreviewRef.current;
      if (preview) {
        onPhasesChange(
          phasesRef.current.map((phase) =>
            phase.id === preview.phaseId
              ? {
                  ...phase,
                  startWeekIndex: preview.startWeekIndex,
                  endWeekIndex: preview.endWeekIndex,
                }
              : phase
          )
        );
      }
      setDragging(null);
      setDragPreview(null);
    }

    function onPointerMove(event: PointerEvent) {
      const pointerWeek = weekIndexFromPointer(event.clientY);
      if (pointerWeek === null) return;
      applyDragAtWeek(pointerWeek, activeDrag);
    }

    function onPointerEnd() {
      finishDrag();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [applyDragAtWeek, dragging, onPhasesChange]);

  return (
    <div
      className={`overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 ${
        dragging ? "select-none" : ""
      }`}
    >
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <th className="w-28 px-2 py-2" />
            <th className="px-3 py-2">Rest</th>
            <th className="px-3 py-2">Wk</th>
            <th className="px-3 py-2">Dates</th>
            <th className="px-3 py-2 text-right">Total h</th>
          </tr>
        </thead>
        <tbody>
          {gutterSegments.map((segment) => {
            if (segment.kind === "unassigned") {
              const week = weeks.find((item) => item.weekIndex === segment.weekIndex)!;
              return (
                <WeekRowGroup
                  key={`unassigned-${week.weekIndex}`}
                  week={week}
                  gutter={
                    <UnassignedGutter
                      weekIndex={week.weekIndex}
                      visible={hoveredWeek === week.weekIndex}
                      onHover={setHoveredWeek}
                      onAdd={() => addPhaseAtWeek(week.weekIndex)}
                    />
                  }
                  expanded={expanded.has(week.weekIndex)}
                  highlighted={highlightedWeekIndex === week.weekIndex}
                  onToggle={() => toggleExpanded(week.weekIndex)}
                  onUpdateWeek={(patch) => updateWeek(week.weekIndex, patch)}
                />
              );
            }

            const phase = displayPhases.find((item) => item.id === segment.phase.id) ?? segment.phase;
            const bandWeeks = weeks.filter(
              (week) => phaseForWeekIndex(displayPhases, week.weekIndex)?.id === phase.id
            );
            const expandedRowCount = bandWeeks.reduce(
              (sum, week) => sum + 1 + (expanded.has(week.weekIndex) ? DISCIPLINES.length : 0),
              0
            );

            return (
              <PhaseBandRows
                key={phase.id ?? phase.name}
                phase={phase}
                weeks={bandWeeks}
                rowSpan={expandedRowCount}
                selected={selectedPhaseId === phase.id}
                isDragging={dragging?.phaseId === phase.id}
                expanded={expanded}
                highlightedWeekIndex={highlightedWeekIndex}
                onSelectPhase={() => onSelectPhase(phase.id ?? null)}
                onToggleExpanded={toggleExpanded}
                onUpdateWeek={updateWeek}
                onDragStart={(edge, clientY) => phase.id && startDrag(phase.id, edge, clientY)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UnassignedGutter({
  weekIndex,
  visible,
  onHover,
  onAdd,
}: {
  weekIndex: number;
  visible: boolean;
  onHover: (weekIndex: number | null) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-[2.5rem] items-center justify-center"
      onMouseEnter={() => onHover(weekIndex)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        onClick={onAdd}
        className={`flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-zinc-300 text-lg leading-none text-zinc-500 transition hover:border-sky-500 hover:text-sky-600 dark:border-zinc-600 ${
          visible ? "opacity-100" : "opacity-0 md:opacity-0"
        } ${visible ? "md:opacity-100" : "md:group-hover:opacity-100"}`}
        aria-label={`Add phase at week ${weekIndex + 1}`}
      >
        +
      </button>
    </div>
  );
}

function PhaseBandGutter({
  phase,
  selected,
  isDragging,
  onSelect,
  onDragStart,
}: {
  phase: SimplePhase;
  selected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (edge: "top" | "bottom", clientY: number) => void;
}) {
  return (
    <div
      className={`relative flex h-full min-h-full flex-col rounded-md border-2 transition ${
        selected || isDragging ? "border-sky-500" : "border-transparent"
      }`}
      style={{ backgroundColor: `${phase.color}33` }}
    >
      <button
        type="button"
        aria-label="Resize phase start"
        className="hidden h-3 w-full shrink-0 cursor-ns-resize rounded-t bg-zinc-400/40 hover:bg-sky-500/60 md:block"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragStart("top", event.clientY);
        }}
      />
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-2 text-center"
      >
        <span
          className="mb-1 h-2 w-2 rounded-full"
          style={{ backgroundColor: phase.color }}
        />
        <span className="text-[10px] font-semibold leading-tight text-zinc-700 dark:text-zinc-200">
          {phase.name}
        </span>
      </button>
      <button
        type="button"
        aria-label="Resize phase end"
        className="hidden h-3 w-full shrink-0 cursor-ns-resize rounded-b bg-zinc-400/40 hover:bg-sky-500/60 md:block"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragStart("bottom", event.clientY);
        }}
      />
    </div>
  );
}

function WeekRowGroup({
  week,
  gutter,
  expanded,
  highlighted,
  onToggle,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  gutter: React.ReactNode;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onUpdateWeek: (patch: Partial<SimpleWeek>) => void;
}) {
  return (
    <>
      <tr
        id={`week-row-${week.weekIndex}`}
        data-week-index={week.weekIndex}
        className={`group border-b border-zinc-100 dark:border-zinc-800 ${
          week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
        } ${highlighted ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
      >
        <td className="px-2 py-2 align-middle">{gutter}</td>
        <WeekCells
          week={week}
          expanded={expanded}
          onToggle={onToggle}
          onUpdateWeek={onUpdateWeek}
        />
      </tr>
      {expanded &&
        DISCIPLINES.map((discipline) => (
          <tr
            key={`${week.weekIndex}-${discipline.key}`}
            data-week-index={week.weekIndex}
            className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
          >
            <td />
            <td colSpan={3} className="px-3 py-1 pl-16 text-zinc-500">
              {discipline.label}
            </td>
            <td className="px-3 py-1 text-right">
              <Input
                type="number"
                step="0.1"
                min="0"
                className="ml-auto w-24 text-right"
                value={week[discipline.key]}
                onChange={(event) =>
                  onUpdateWeek({ [discipline.key]: Number(event.target.value) })
                }
              />
            </td>
          </tr>
        ))}
    </>
  );
}

function PhaseBandRows({
  phase,
  weeks,
  rowSpan,
  selected,
  isDragging,
  expanded,
  highlightedWeekIndex,
  onSelectPhase,
  onToggleExpanded,
  onUpdateWeek,
  onDragStart,
}: {
  phase: SimplePhase;
  weeks: SimpleWeek[];
  rowSpan: number;
  selected: boolean;
  isDragging: boolean;
  expanded: Set<number>;
  highlightedWeekIndex: number | null;
  onSelectPhase: () => void;
  onToggleExpanded: (weekIndex: number) => void;
  onUpdateWeek: (weekIndex: number, patch: Partial<SimpleWeek>) => void;
  onDragStart: (edge: "top" | "bottom", clientY: number) => void;
}) {
  return (
    <>
      {weeks.map((week, index) => (
        <Fragment key={week.weekIndex}>
          <tr
            id={`week-row-${week.weekIndex}`}
            data-week-index={week.weekIndex}
            className={`border-b border-zinc-100 dark:border-zinc-800 ${
              week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
            } ${highlightedWeekIndex === week.weekIndex ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
          >
            {index === 0 && (
              <td rowSpan={rowSpan} className="w-28 px-2 py-2 align-top">
                <PhaseBandGutter
                  phase={phase}
                  selected={selected}
                  isDragging={isDragging}
                  onSelect={onSelectPhase}
                  onDragStart={onDragStart}
                />
              </td>
            )}
            <WeekCells
              week={week}
              expanded={expanded.has(week.weekIndex)}
              onToggle={() => onToggleExpanded(week.weekIndex)}
              onUpdateWeek={(patch) => onUpdateWeek(week.weekIndex, patch)}
            />
          </tr>
          {expanded.has(week.weekIndex) &&
            DISCIPLINES.map((discipline) => (
              <tr
                key={`${week.weekIndex}-${discipline.key}`}
                data-week-index={week.weekIndex}
                className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
              >
                <td colSpan={3} className="px-3 py-1 pl-16 text-zinc-500">
                  {discipline.label}
                </td>
                <td className="px-3 py-1 text-right">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="ml-auto w-24 text-right"
                    value={week[discipline.key]}
                    onChange={(event) =>
                      onUpdateWeek(week.weekIndex, {
                        [discipline.key]: Number(event.target.value),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
        </Fragment>
      ))}
    </>
  );
}

function WeekCells({
  week,
  expanded,
  onToggle,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  expanded: boolean;
  onToggle: () => void;
  onUpdateWeek: (patch: Partial<SimpleWeek>) => void;
}) {
  return (
    <>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={week.isRestWeek}
          onChange={(event) => onUpdateWeek({ isRestWeek: event.target.checked })}
          aria-label={`Rest week ${week.weekIndex + 1}`}
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="font-medium text-sky-600 dark:text-sky-400"
        >
          {expanded ? "▼" : "▶"} {week.weekIndex + 1}
        </button>
      </td>
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
        {formatWeekDateRange(week.weekStartDate)}
      </td>
      <td className="px-3 py-2 text-right font-medium">{week.totalHours}</td>
    </>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
