"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPhaseAtWeek,
  type SimplePhase,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { formatWeekDateRange } from "@/components/simple-planner/simple-planner-timeline";
import {
  getZoneMinute,
  zoneMinutesForDiscipline,
} from "@/lib/plan/season/simple-tiz";
import {
  buildGutterSegments,
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
  { key: "swimHours" as const, distanceKey: "swimDistanceMeters" as const, label: "Swim", discipline: "SWIM" as const, simple: "swim" as const },
  { key: "bikeHours" as const, distanceKey: null, label: "Bike", discipline: "BIKE" as const, simple: "bike" as const },
  { key: "runHours" as const, distanceKey: "runDistanceMeters" as const, label: "Run", discipline: "RUN" as const, simple: "run" as const },
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
        weeks.map((week) => (week.weekIndex === weekIndex ? { ...week, ...patch } : week))
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
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <th className="w-28 px-2 py-2" />
            <th className="px-3 py-2">Wk</th>
            <th className="px-3 py-2">Dates</th>
            <th className="px-3 py-2">Rest</th>
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
              (week) =>
                week.weekIndex >= phase.startWeekIndex && week.weekIndex <= phase.endWeekIndex
            );
            return (
              <PhaseBandRows
                key={phase.id ?? phase.name}
                phase={phase}
                weeks={bandWeeks}
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

function phaseBandGutterClasses(
  position: "only" | "first" | "middle" | "last",
  selected: boolean,
  isDragging: boolean
) {
  const roundedClass =
    position === "only"
      ? "rounded-md"
      : position === "first"
        ? "rounded-t-md"
        : position === "last"
          ? "rounded-b-md"
          : "";
  const borderClass =
    position === "only"
      ? "border-2"
      : position === "first"
        ? "border-x-2 border-t-2"
        : position === "last"
          ? "border-x-2 border-b-2"
          : "border-x-2";

  return {
    roundedClass,
    borderClass: `${borderClass} transition ${
      selected || isDragging ? "border-sky-500" : "border-transparent"
    } ${position === "middle" || position === "last" ? "-mt-px" : ""}`,
  };
}

function PhaseBandGutterCell({
  phase,
  rowSpan,
  position,
  showLabel,
  showTopHandle,
  showBottomHandle,
  selected,
  isDragging,
  onSelect,
  onDragStart,
}: {
  phase: SimplePhase;
  rowSpan: number;
  position: "only" | "first" | "middle" | "last";
  showLabel: boolean;
  showTopHandle: boolean;
  showBottomHandle: boolean;
  selected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (edge: "top" | "bottom", clientY: number) => void;
}) {
  const { roundedClass, borderClass } = phaseBandGutterClasses(position, selected, isDragging);

  return (
    <td rowSpan={rowSpan} className="relative w-28 p-0 align-top">
      <div
        aria-hidden
        className={`absolute inset-0 ${roundedClass} ${borderClass}`}
        style={{ backgroundColor: `${phase.color}33` }}
      />
      <div className="relative z-[1] flex min-h-[2.5rem] flex-col">
        {showTopHandle && (
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
        )}
        {showLabel ? (
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
        ) : (
          <div className="flex-1" aria-hidden />
        )}
        {showBottomHandle && (
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
        )}
      </div>
    </td>
  );
}

function phaseWeekGutterPosition(
  weekIndex: number,
  weekCount: number
): "only" | "first" | "middle" | "last" {
  if (weekCount === 1) return "only";
  if (weekIndex === 0) return "first";
  if (weekIndex === weekCount - 1) return "last";
  return "middle";
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
  const rowSpan = expanded ? 1 + DISCIPLINES.length : 1;

  return (
    <>
      <tr
        id={`week-row-${week.weekIndex}`}
        data-week-index={week.weekIndex}
        className={`group border-b border-zinc-100 dark:border-zinc-800 ${
          week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
        } ${highlighted ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
      >
        <td rowSpan={rowSpan} className="px-2 py-2 align-top">
          {gutter}
        </td>
        <WeekCells
          week={week}
          expanded={expanded}
          onToggle={onToggle}
          onUpdateWeek={onUpdateWeek}
        />
      </tr>
      {expanded &&
        DISCIPLINES.map((discipline) => (
          <DisciplineExpandedRow
            key={`${week.weekIndex}-${discipline.key}`}
            week={week}
            discipline={discipline}
          />
        ))}
    </>
  );
}

function PhaseBandRows({
  phase,
  weeks,
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
      {weeks.map((week, index) => {
        const isLastWeek = index === weeks.length - 1;
        const weekExpanded = expanded.has(week.weekIndex);
        const rowSpan = weekExpanded ? 1 + DISCIPLINES.length : 1;

        return (
          <Fragment key={week.weekIndex}>
            <tr
              id={`week-row-${week.weekIndex}`}
              data-week-index={week.weekIndex}
              className={`border-b border-zinc-100 dark:border-zinc-800 ${
                week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
              } ${highlightedWeekIndex === week.weekIndex ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
            >
              <PhaseBandGutterCell
                phase={phase}
                rowSpan={rowSpan}
                position={phaseWeekGutterPosition(index, weeks.length)}
                showLabel={index === 0}
                showTopHandle={index === 0}
                showBottomHandle={isLastWeek}
                selected={selected}
                isDragging={isDragging}
                onSelect={onSelectPhase}
                onDragStart={onDragStart}
              />
              <WeekCells
                week={week}
                expanded={weekExpanded}
                onToggle={() => onToggleExpanded(week.weekIndex)}
                onUpdateWeek={(patch) => onUpdateWeek(week.weekIndex, patch)}
              />
            </tr>
            {weekExpanded &&
              DISCIPLINES.map((discipline) => (
                <tr
                  key={`${week.weekIndex}-${discipline.key}`}
                  data-week-index={week.weekIndex}
                  className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
                >
                  <DisciplineExpandedCells week={week} discipline={discipline} />
                </tr>
              ))}
          </Fragment>
        );
      })}
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
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={week.isRestWeek}
          onChange={(event) => onUpdateWeek({ isRestWeek: event.target.checked })}
          aria-label={`Rest week ${week.weekIndex + 1}`}
        />
      </td>
      <td className="px-3 py-2 text-right font-medium">{week.totalHours}</td>
    </>
  );
}

type DisciplineRowConfig = (typeof DISCIPLINES)[number];

function DisciplineExpandedRow({
  week,
  discipline,
}: {
  week: SimpleWeek;
  discipline: DisciplineRowConfig;
}) {
  return (
    <tr
      data-week-index={week.weekIndex}
      className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
    >
      <DisciplineExpandedCells week={week} discipline={discipline} />
    </tr>
  );
}

function DisciplineExpandedCells({
  week,
  discipline,
}: {
  week: SimpleWeek;
  discipline: DisciplineRowConfig;
}) {
  const hours = week[discipline.key];
  const zoneTotal = zoneMinutesForDiscipline(week.zoneMinutes, discipline.discipline);
  const z3 = getZoneMinute(week.zoneMinutes, discipline.discipline, 3);

  return (
    <>
      <td colSpan={3} className="px-3 py-2 pl-16 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{discipline.label}</span>
        <span className="mx-2">·</span>
        <span>{hours}h</span>
        <span className="mx-2">·</span>
        <span>
          TiZ {Math.round(zoneTotal)}m (Z3 {Math.round(z3)}m)
        </span>
      </td>
      <td className="px-3 py-2 text-right font-medium">{hours}</td>
    </>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
