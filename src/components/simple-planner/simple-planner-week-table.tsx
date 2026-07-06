"use client";

import { useCallback, useMemo, useState } from "react";
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

const DISCIPLINES = [
  { key: "swimHours" as const, label: "Swim" },
  { key: "bikeHours" as const, label: "Bike" },
  { key: "runHours" as const, label: "Run" },
];

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
  const [dragging, setDragging] = useState<{
    phaseId: string;
    edge: "top" | "bottom";
    pointerWeek: number;
  } | null>(null);

  const gutterSegments = useMemo(() => buildGutterSegments(weeks, phases), [weeks, phases]);

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

  const updatePhase = useCallback(
    (updated: SimplePhase) => {
      onPhasesChange(
        phases.map((phase) =>
          (phase.id ?? phase.name) === (updated.id ?? updated.name) ? updated : phase
        )
      );
    },
    [onPhasesChange, phases]
  );

  const handleDragMove = useCallback(
    (pointerWeek: number) => {
      if (!dragging) return;
      const phase = phases.find((item) => item.id === dragging.phaseId);
      if (!phase) return;

      if (dragging.edge === "top") {
        updatePhase(resizePhaseTop(phase, phases, weeks.length, pointerWeek));
      } else {
        updatePhase(resizePhaseBottom(phase, phases, weeks.length, pointerWeek));
      }
    },
    [dragging, phases, updatePhase, weeks.length]
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
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
        <tbody
          onPointerMove={(event) => {
            if (!dragging) return;
            const row = (event.target as HTMLElement).closest("tr[data-week-index]");
            if (!row) return;
            const weekIndex = Number(row.getAttribute("data-week-index"));
            if (!Number.isNaN(weekIndex)) handleDragMove(weekIndex);
          }}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
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

            const phase = segment.phase;
            const bandWeeks = weeks.filter((week) =>
              phaseForWeekIndex(phases, week.weekIndex)?.id === phase.id
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
                expanded={expanded}
                highlightedWeekIndex={highlightedWeekIndex}
                onSelectPhase={() => onSelectPhase(phase.id ?? null)}
                onToggleExpanded={toggleExpanded}
                onUpdateWeek={updateWeek}
                onDragStart={(edge) =>
                  phase.id &&
                  setDragging({ phaseId: phase.id, edge, pointerWeek: phase.startWeekIndex })
                }
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
  onSelect,
  onDragStart,
}: {
  phase: SimplePhase;
  selected: boolean;
  onSelect: () => void;
  onDragStart: (edge: "top" | "bottom") => void;
}) {
  return (
    <div
      className={`relative flex h-full min-h-full flex-col rounded-md border-2 transition ${
        selected ? "border-sky-500" : "border-transparent"
      }`}
      style={{ backgroundColor: `${phase.color}33` }}
    >
      <button
        type="button"
        aria-label="Resize phase start"
        className="hidden h-2 w-full shrink-0 cursor-ns-resize rounded-t bg-zinc-400/40 hover:bg-sky-500/60 md:block"
        onPointerDown={(event) => {
          event.preventDefault();
          onDragStart("top");
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
        className="hidden h-2 w-full shrink-0 cursor-ns-resize rounded-b bg-zinc-400/40 hover:bg-sky-500/60 md:block"
        onPointerDown={(event) => {
          event.preventDefault();
          onDragStart("bottom");
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
  expanded: Set<number>;
  highlightedWeekIndex: number | null;
  onSelectPhase: () => void;
  onToggleExpanded: (weekIndex: number) => void;
  onUpdateWeek: (weekIndex: number, patch: Partial<SimpleWeek>) => void;
  onDragStart: (edge: "top" | "bottom") => void;
}) {
  return (
    <>
      {weeks.map((week, index) => (
        <tr
          key={week.weekIndex}
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
      ))}
      {weeks.flatMap((week) =>
        expanded.has(week.weekIndex)
          ? DISCIPLINES.map((discipline) => (
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
            ))
          : []
      )}
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
