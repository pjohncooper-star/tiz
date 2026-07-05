"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { phaseForWeek, type SimplePhase, type SimpleWeek } from "./simple-planner-types";
import { formatWeekDateRange } from "./simple-planner-timeline";

type SimplePlannerWeekTableProps = {
  weeks: SimpleWeek[];
  phases: SimplePhase[];
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
  onWeeksChange,
  onPhasesChange,
  highlightedWeekIndex,
}: SimplePlannerWeekTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [editingPhase, setEditingPhase] = useState<SimplePhase | null>(null);

  function toggleExpanded(weekIndex: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(weekIndex)) next.delete(weekIndex);
      else next.add(weekIndex);
      return next;
    });
  }

  function updateWeek(weekIndex: number, patch: Partial<SimpleWeek>) {
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
  }

  function updatePhase(updated: SimplePhase) {
    onPhasesChange(
      phases.map((phase) =>
        (phase.id ?? phase.name) === (updated.id ?? updated.name) ? updated : phase
      )
    );
    setEditingPhase(null);
  }

  function addPhase() {
    const lastEnd = phases.reduce((max, phase) => Math.max(max, phase.endWeekIndex), -1);
    const startWeekIndex = Math.min(lastEnd + 1, weeks.length - 1);
    const endWeekIndex = Math.min(startWeekIndex + 3, weeks.length - 1);
    onPhasesChange([
      ...phases,
      {
        name: `Phase ${phases.length + 1}`,
        color: "#38bdf8",
        startWeekIndex,
        endWeekIndex,
        rampEnabled: { swim: true, bike: true, run: true },
      },
    ]);
  }

  function removePhase(phase: SimplePhase) {
    onPhasesChange(
      phases.filter((item) => (item.id ?? item.name) !== (phase.id ?? phase.name))
    );
    setEditingPhase(null);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
              <th className="px-3 py-2">Phase</th>
              <th className="px-3 py-2">Rest</th>
              <th className="px-3 py-2">Wk</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2 text-right">Total h</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => {
              const phase = phaseForWeek(phases, week.weekIndex);
              const isExpanded = expanded.has(week.weekIndex);
              const highlighted = highlightedWeekIndex === week.weekIndex;
              return (
                <WeekRows
                  key={week.weekIndex}
                  week={week}
                  phase={phase}
                  isExpanded={isExpanded}
                  highlighted={highlighted}
                  onToggle={() => toggleExpanded(week.weekIndex)}
                  onEditPhase={() => phase && setEditingPhase(phase)}
                  onUpdateWeek={(patch) => updateWeek(week.weekIndex, patch)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="secondary" onClick={addPhase}>
        Add phase
      </Button>

      {editingPhase && (
        <PhaseEditorPanel
          phase={editingPhase}
          totalWeeks={weeks.length}
          onSave={updatePhase}
          onDelete={() => removePhase(editingPhase)}
          onClose={() => setEditingPhase(null)}
        />
      )}
    </div>
  );
}

function WeekRows({
  week,
  phase,
  isExpanded,
  highlighted,
  onToggle,
  onEditPhase,
  onUpdateWeek,
}: {
  week: SimpleWeek;
  phase: SimplePhase | null;
  isExpanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onEditPhase: () => void;
  onUpdateWeek: (patch: Partial<SimpleWeek>) => void;
}) {
  return (
    <>
      <tr
        id={`week-row-${week.weekIndex}`}
        className={`border-b border-zinc-100 dark:border-zinc-800 ${
          week.isRestWeek ? "bg-zinc-50/80 dark:bg-zinc-900/30" : ""
        } ${highlighted ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}
      >
        <td className="px-3 py-2">
          {phase ? (
            <button
              type="button"
              onClick={onEditPhase}
              className="rounded px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: phase.color }}
            >
              {phase.name}
            </button>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
        </td>
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
            {isExpanded ? "▼" : "▶"} {week.weekIndex + 1}
          </button>
        </td>
        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
          {formatWeekDateRange(week.weekStartDate)}
        </td>
        <td className="px-3 py-2 text-right font-medium">{week.totalHours}</td>
      </tr>
      {isExpanded &&
        DISCIPLINES.map((discipline) => (
          <tr
            key={`${week.weekIndex}-${discipline.key}`}
            className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/20"
          >
            <td colSpan={4} className="px-3 py-1 pl-16 text-zinc-500">
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

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function PhaseEditorPanel({
  phase,
  totalWeeks,
  onSave,
  onDelete,
  onClose,
}: {
  phase: SimplePhase;
  totalWeeks: number;
  onSave: (phase: SimplePhase) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(phase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold">Phase</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            Label
            <Input
              className="mt-1"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            Color
            <Input
              className="mt-1"
              type="color"
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              From week
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={totalWeeks}
                value={draft.startWeekIndex + 1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    startWeekIndex: Math.max(0, Number(event.target.value) - 1),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              To week
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={totalWeeks}
                value={draft.endWeekIndex + 1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    endWeekIndex: Math.min(totalWeeks - 1, Number(event.target.value) - 1),
                  })
                }
              />
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Ramp by discipline</legend>
            {(["swim", "bike", "run"] as const).map((discipline) => (
              <label key={discipline} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={draft.rampEnabled[discipline]}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rampEnabled: {
                        ...draft.rampEnabled,
                        [discipline]: event.target.checked,
                      },
                    })
                  }
                />
                {discipline} ramp on
              </label>
            ))}
          </fieldset>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={() => onSave(draft)}>
            Done
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onDelete}>
            Delete phase
          </Button>
        </div>
      </div>
    </div>
  );
}
