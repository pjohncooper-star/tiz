"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import {
  distanceDisplayToMeters,
  distanceMetersToDisplay,
  hoursFromDisciplineDistance,
} from "@/components/simple-planner/simple-planner-volume-display";
import { ZonePillInput } from "@/components/simple-planner/zone-pill";
import { distanceMetersFromHoursPace } from "@/lib/plan/season/distance-pace-rollup";
import {
  createPhaseAtWeek,
  type SimplePhase,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { formatWeekDateRange } from "@/components/simple-planner/simple-planner-timeline";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import {
  clampZoneMinutesToVolume,
  getZoneMinute,
  setZoneMinute,
  zoneMinutesBudget,
  zoneMinutesExceedsVolume,
} from "@/lib/plan/season/simple-tiz";
import {
  buildGutterSegments,
  resizePhaseBottom,
  resizePhaseTop,
  weekIsAssigned,
} from "@/lib/plan/season/phase-span-utils";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";

type SimplePlannerWeekTableProps = {
  weeks: SimpleWeek[];
  phases: SimplePhase[];
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
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
  rampDefaults,
  disciplineSettings,
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
          const next = { ...week, ...patch };
          const swimHours = next.swimHours;
          const bikeHours = next.bikeHours;
          const runHours = next.runHours;
          const zoneMinutes = clampZoneMinutesToVolume({
            weekIndex: next.weekIndex,
            isRestWeek: next.isRestWeek,
            swimHours,
            bikeHours,
            runHours,
            zoneMinutes: next.zoneMinutes ?? {},
            zoneMinutesOverridden: next.zoneMinutesOverridden,
          });
          return {
            ...next,
            swimHours,
            bikeHours,
            runHours,
            zoneMinutes,
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
      <table className="min-w-full border-collapse text-sm">
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
                  rampDefaults={rampDefaults}
                  disciplineSettings={disciplineSettings}
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
                rampDefaults={rampDefaults}
                disciplineSettings={disciplineSettings}
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
  position: "only" | "first" | "middle" | "last";
  showLabel: boolean;
  showTopHandle: boolean;
  showBottomHandle: boolean;
  selected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (edge: "top" | "bottom", clientY: number) => void;
}) {
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

  return (
    <div
      className={`relative flex min-h-[2.5rem] flex-col ${roundedClass} ${borderClass} transition ${
        selected || isDragging ? "border-sky-500" : "border-transparent"
      } ${position === "middle" || position === "last" ? "-mt-px" : ""}`}
      style={{ backgroundColor: `${phase.color}33` }}
    >
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
  );
}

function phaseBandGutterPosition(
  gutterRowIndex: number,
  gutterRowCount: number
): "only" | "first" | "middle" | "last" {
  if (gutterRowCount === 1) return "only";
  if (gutterRowIndex === 0) return "first";
  if (gutterRowIndex === gutterRowCount - 1) return "last";
  return "middle";
}

function WeekRowGroup({
  week,
  rampDefaults,
  disciplineSettings,
  gutter,
  expanded,
  highlighted,
  onToggle,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
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
          <DisciplineExpandedRow
            key={`${week.weekIndex}-${discipline.key}`}
            week={week}
            discipline={discipline}
            rampDefaults={rampDefaults}
            disciplineSettings={disciplineSettings}
            onUpdateWeek={onUpdateWeek}
          />
        ))}
    </>
  );
}

function PhaseBandRows({
  phase,
  weeks,
  rampDefaults,
  disciplineSettings,
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
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  selected: boolean;
  isDragging: boolean;
  expanded: Set<number>;
  highlightedWeekIndex: number | null;
  onSelectPhase: () => void;
  onToggleExpanded: (weekIndex: number) => void;
  onUpdateWeek: (weekIndex: number, patch: Partial<SimpleWeek>) => void;
  onDragStart: (edge: "top" | "bottom", clientY: number) => void;
}) {
  const gutterRowCount = weeks.reduce(
    (count, week) => count + 1 + (expanded.has(week.weekIndex) ? DISCIPLINES.length : 0),
    0
  );
  let gutterRowIndex = 0;

  return (
    <>
      {weeks.map((week, index) => {
        const isLastWeek = index === weeks.length - 1;
        const weekExpanded = expanded.has(week.weekIndex);
        const mainGutterIndex = gutterRowIndex;
        gutterRowIndex += 1;

        return (
          <Fragment key={week.weekIndex}>
            <tr
              id={`week-row-${week.weekIndex}`}
              data-week-index={week.weekIndex}
              className={`border-b border-zinc-100 dark:border-zinc-800 ${
                week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
              } ${highlightedWeekIndex === week.weekIndex ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
            >
              <td className="w-28 px-2 py-0 align-top">
                <PhaseBandGutter
                  phase={phase}
                  position={phaseBandGutterPosition(mainGutterIndex, gutterRowCount)}
                  showLabel={index === 0}
                  showTopHandle={index === 0}
                  showBottomHandle={isLastWeek && !weekExpanded}
                  selected={selected}
                  isDragging={isDragging}
                  onSelect={onSelectPhase}
                  onDragStart={onDragStart}
                />
              </td>
              <WeekCells
                week={week}
                expanded={weekExpanded}
                onToggle={() => onToggleExpanded(week.weekIndex)}
                onUpdateWeek={(patch) => onUpdateWeek(week.weekIndex, patch)}
              />
            </tr>
            {weekExpanded &&
              DISCIPLINES.map((discipline) => {
                const expandedGutterIndex = gutterRowIndex;
                gutterRowIndex += 1;
                const isLastGutterRow = expandedGutterIndex === gutterRowCount - 1;

                return (
                  <tr
                    key={`${week.weekIndex}-${discipline.key}`}
                    data-week-index={week.weekIndex}
                    className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
                  >
                    <td className="w-28 px-2 py-0 align-top">
                      <PhaseBandGutter
                        phase={phase}
                        position={phaseBandGutterPosition(expandedGutterIndex, gutterRowCount)}
                        showLabel={false}
                        showTopHandle={false}
                        showBottomHandle={isLastGutterRow}
                        selected={selected}
                        isDragging={isDragging}
                        onSelect={onSelectPhase}
                        onDragStart={onDragStart}
                      />
                    </td>
                    <DisciplineExpandedCells
                      week={week}
                      discipline={discipline}
                      rampDefaults={rampDefaults}
                      disciplineSettings={disciplineSettings}
                      onUpdateWeek={(patch) => onUpdateWeek(week.weekIndex, patch)}
                    />
                  </tr>
                );
              })}
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

type DisciplineRowConfig = (typeof DISCIPLINES)[number];

function DisciplineExpandedRow({
  week,
  discipline,
  rampDefaults,
  disciplineSettings,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  discipline: DisciplineRowConfig;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onUpdateWeek: (patch: Partial<SimpleWeek>) => void;
}) {
  return (
    <tr
      data-week-index={week.weekIndex}
      className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
    >
      <td />
      <DisciplineExpandedCells
        week={week}
        discipline={discipline}
        rampDefaults={rampDefaults}
        disciplineSettings={disciplineSettings}
        onUpdateWeek={onUpdateWeek}
      />
    </tr>
  );
}

function DisciplineExpandedCells({
  week,
  discipline,
  rampDefaults,
  disciplineSettings,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  discipline: DisciplineRowConfig;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onUpdateWeek: (patch: Partial<SimpleWeek>) => void;
}) {
  const def = rampDefaults[discipline.simple];
  const distanceMode =
    discipline.distanceKey != null && def.mode === "DISTANCE";
  const paceDiscipline =
    discipline.discipline === "SWIM" ? "SWIM" : discipline.discipline === "RUN" ? "RUN" : null;
  const hours = week[discipline.key];
  const distanceMeters = discipline.distanceKey ? week[discipline.distanceKey] : null;
  const budget = zoneMinutesBudget(week, discipline.discipline, week.zoneMinutes);
  const overBudget = zoneMinutesExceedsVolume(
    week,
    discipline.discipline,
    week.zoneMinutes
  );

  function updateVolumeFromHours(nextHours: number) {
    const patch: Partial<SimpleWeek> = { [discipline.key]: nextHours };
    if (discipline.distanceKey && paceDiscipline && def.referencePaceSeconds > 0) {
      patch[discipline.distanceKey] = Math.round(
        distanceMetersFromHoursPace(paceDiscipline, nextHours, def.referencePaceSeconds)
      );
    }
    onUpdateWeek(patch);
  }

  function updateVolumeFromDistance(input: string) {
    if (!discipline.distanceKey || !paceDiscipline) return;
    const meters = distanceDisplayToMeters(
      input,
      paceDiscipline,
      disciplineSettings
    );
    if (meters == null) return;
    onUpdateWeek({
      [discipline.distanceKey]: meters,
      [discipline.key]: hoursFromDisciplineDistance(paceDiscipline, meters, def),
    });
  }

  return (
    <>
      <td colSpan={3} className="px-3 py-2 pl-16">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-12 text-zinc-500">{discipline.label}</span>
            {distanceMode && discipline.distanceKey && paceDiscipline ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-28"
                  value={distanceMetersToDisplay(distanceMeters, paceDiscipline, disciplineSettings)}
                  onChange={(event) => updateVolumeFromDistance(event.target.value)}
                />
                <span className="text-xs text-zinc-500">{hours}h</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-24"
                  value={hours}
                  onChange={(event) => updateVolumeFromHours(Number(event.target.value))}
                />
                <span className="text-xs text-zinc-500">h/wk</span>
                {discipline.distanceKey && paceDiscipline && distanceMeters ? (
                  <span className="text-xs text-zinc-500">
                    {distanceMetersToDisplay(distanceMeters, paceDiscipline, disciplineSettings)}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((zone) => (
              <ZonePillInput
                key={zone}
                zone={zone}
                suffix="m"
                value={getZoneMinute(week.zoneMinutes, discipline.discipline, zone)}
                onChange={(minutes) =>
                  onUpdateWeek({
                    zoneMinutes: setZoneMinute(
                      week.zoneMinutes,
                      discipline.discipline,
                      zone,
                      minutes
                    ),
                    zoneMinutesOverridden: true,
                  })
                }
              />
            ))}
            <span className={`text-xs ${overBudget ? "text-red-600" : "text-zinc-500"}`}>
              {budget.used}m / {budget.cap}m
            </span>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-medium">{hours}</td>
    </>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
