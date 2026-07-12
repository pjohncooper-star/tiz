"use client";

import { Button, Input, Label } from "@/components/ui";
import { ZoneSplitEditor } from "@/components/simple-planner/zone-split-editor";
import {
  createEmptyPhase,
  inferPhaseKindFromName,
  type SimplePhase,
} from "@/components/simple-planner/simple-planner-types";
import {
  phaseKindLabel,
  seedPhaseZoneSplits,
} from "@/lib/plan/season/phase-zone-defaults";
import type { PhaseKind } from "@prisma/client";
import type { PhaseKindZoneDefaults } from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { zoneSplitsForPhase } from "@/lib/plan/season/simple-phase-zone-seed";
import {
  formatUnassignedWeeks,
  formatWeekRange,
  isAssignedPhase,
  isEmptyPhase,
  setPhaseWeekRange,
} from "@/lib/plan/season/phase-span-utils";

type SimplePlannerPhasesPaneProps = {
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
  totalWeeks: number;
  selectedPhaseId: string | null;
  onSelectPhase: (phaseId: string | null) => void;
  onPhasesChange: (phases: SimplePhase[]) => void;
};

export function SimplePlannerPhasesPane({
  phases,
  phaseKindZoneDefaults,
  zoneFocusCatalog,
  totalWeeks,
  selectedPhaseId,
  onSelectPhase,
  onPhasesChange,
}: SimplePlannerPhasesPaneProps) {
  const selected =
    phases.find((phase) => phase.id === selectedPhaseId) ??
    phases.find((phase) => !phase.id && selectedPhaseId === phase.name) ??
    null;

  function updatePhase(updated: SimplePhase) {
    onPhasesChange(
      phases.map((phase) =>
        (phase.id ?? phase.name) === (updated.id ?? updated.name) ? updated : phase
      )
    );
  }

  function deletePhase(phase: SimplePhase) {
    onPhasesChange(
      phases.filter((item) => (item.id ?? item.name) !== (phase.id ?? phase.name))
    );
    if (selectedPhaseId === phase.id) onSelectPhase(null);
  }

  function addEmptyPhase() {
    const next = createEmptyPhase(phases.length + 1, phaseKindZoneDefaults);
    onPhasesChange([...phases, next]);
    onSelectPhase(next.id ?? null);
  }

  const assignedPhases = phases.filter(isAssignedPhase);
  const unassignedLabel = formatUnassignedWeeks(totalWeeks, phases);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={addEmptyPhase}>
          + Add phase
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {assignedPhases.map((phase) => {
          const active = selectedPhaseId === phase.id;
          return (
            <button
              key={phase.id ?? phase.name}
              type="button"
              onClick={() => onSelectPhase(phase.id ?? null)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                active
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: phase.color }}
                />
                <span className="font-medium">{phase.name}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatWeekRange(phase.startWeekIndex, phase.endWeekIndex)}
              </p>
            </button>
          );
        })}

        {phases.filter(isEmptyPhase).map((phase) => {
          const active = selectedPhaseId === phase.id;
          return (
            <button
              key={phase.id ?? phase.name}
              type="button"
              onClick={() => onSelectPhase(phase.id ?? null)}
              className={`rounded-lg border border-dashed px-3 py-2 text-left text-sm ${
                active ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-zinc-300"
              }`}
            >
              <span className="font-medium">{phase.name}</span>
              <p className="mt-1 text-xs text-zinc-500">Not assigned</p>
            </button>
          );
        })}

        <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          <p className="font-medium text-zinc-600 dark:text-zinc-400">Unassigned</p>
          <p className="mt-1 text-xs text-zinc-500">{unassignedLabel}</p>
        </div>
      </div>

      {selected && (
        <PhaseDetailEditor
          phase={selected}
          phases={phases}
          phaseKindZoneDefaults={phaseKindZoneDefaults}
          zoneFocusCatalog={zoneFocusCatalog}
          totalWeeks={totalWeeks}
          onChange={updatePhase}
          onDelete={() => deletePhase(selected)}
        />
      )}
    </div>
  );
}

function PhaseDetailEditor({
  phase,
  phases,
  phaseKindZoneDefaults,
  zoneFocusCatalog,
  totalWeeks,
  onChange,
  onDelete,
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
  totalWeeks: number;
  onChange: (phase: SimplePhase) => void;
  onDelete: () => void;
}) {
  const assigned = isAssignedPhase(phase);
  const weekLabel = assigned
    ? formatWeekRange(phase.startWeekIndex, phase.endWeekIndex)
    : "Not assigned — click + on a week in the table";

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold">Editing: {phase.name}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Phase kind</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={phase.phaseKind}
            onChange={(event) => {
              const phaseKind = event.target.value as PhaseKind;
              onChange({
                ...phase,
                phaseKind,
                zoneSplits: seedPhaseZoneSplits(phaseKind, phaseKindZoneDefaults),
              });
            }}
          >
            {(["BASE", "BUILD", "RACE_PREP", "TAPER"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {phaseKindLabel(kind)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Label</Label>
          <Input
            className="mt-1"
            value={phase.name}
            onChange={(event) =>
              onChange({
                ...phase,
                name: event.target.value,
                phaseKind: inferPhaseKindFromName(event.target.value),
              })
            }
          />
        </div>
        <div>
          <Label>Color</Label>
          <Input
            className="mt-1"
            type="color"
            value={phase.color}
            onChange={(event) => onChange({ ...phase, color: event.target.value })}
          />
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Weeks: <span className="font-medium">{weekLabel}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:hidden">
        <div>
          <Label>From week</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={assigned ? phase.startWeekIndex + 1 : ""}
            onChange={(event) => {
              const start = Number(event.target.value) - 1;
              const end = assigned ? phase.endWeekIndex : start;
              onChange(setPhaseWeekRange(phase, phases, totalWeeks, start, end));
            }}
          >
            <option value="">—</option>
            {Array.from({ length: totalWeeks }, (_, index) => (
              <option key={index} value={index + 1}>
                Week {index + 1}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>To week</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={assigned ? phase.endWeekIndex + 1 : ""}
            onChange={(event) => {
              const end = Number(event.target.value) - 1;
              const start = assigned ? phase.startWeekIndex : end;
              onChange(setPhaseWeekRange(phase, phases, totalWeeks, start, end));
            }}
          >
            <option value="">—</option>
            {Array.from({ length: totalWeeks }, (_, index) => (
              <option key={index} value={index + 1}>
                Week {index + 1}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Sessions per week</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { key: "swimSessionsPerWeek" as const, label: "Swim" },
              { key: "bikeSessionsPerWeek" as const, label: "Bike" },
              { key: "runSessionsPerWeek" as const, label: "Run" },
              { key: "strengthSessionsPerWeek" as const, label: "Strength" },
            ] as const
          ).map((field) => (
            <div key={field.key}>
              <Label>{field.label}</Label>
              <Input
                type="number"
                min={0}
                max={7}
                className="mt-1"
                value={phase[field.key]}
                onChange={(event) =>
                  onChange({
                    ...phase,
                    [field.key]: Number(event.target.value),
                  })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Intense days per week</legend>
        <p className="text-xs text-zinc-500">
          Days with zone 3+ work, per discipline. Used to split TiZ across generated workouts.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { key: "swimIntenseDaysPerWeek" as const, label: "Swim" },
              { key: "bikeIntenseDaysPerWeek" as const, label: "Bike" },
              { key: "runIntenseDaysPerWeek" as const, label: "Run" },
            ] as const
          ).map((field) => (
            <div key={field.key}>
              <Label>{field.label}</Label>
              <Input
                type="number"
                min={0}
                max={7}
                className="mt-1"
                value={phase[field.key]}
                onChange={(event) =>
                  onChange({
                    ...phase,
                    [field.key]: Number(event.target.value),
                  })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Zone focus (TiZ %)</legend>
        <p className="text-xs text-zinc-500">
          Overrides phase-kind defaults for this phase. Zone minutes are computed from volume ×
          these splits.
        </p>
        <ZoneSplitEditor
          value={zoneSplitsForPhase(phase, phaseKindZoneDefaults)}
          onChange={(zoneSplits) => onChange({ ...phase, zoneSplits })}
          catalog={zoneFocusCatalog}
          showPresetPercents
        />
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Ramp by discipline</legend>
        {(["swim", "bike", "run"] as const).map((discipline) => (
          <label key={discipline} className="flex items-center gap-2 text-sm capitalize">
            <input
              type="checkbox"
              checked={phase.rampEnabled[discipline]}
              onChange={(event) =>
                onChange({
                  ...phase,
                  rampEnabled: {
                    ...phase.rampEnabled,
                    [discipline]: event.target.checked,
                  },
                })
              }
            />
            {discipline} ramp on
          </label>
        ))}
      </fieldset>

      <div className="mt-4">
        <Label>Phase goal</Label>
        <Input
          className="mt-1"
          value={phase.goal ?? ""}
          placeholder="Optional focus for this phase"
          onChange={(event) => onChange({ ...phase, goal: event.target.value || null })}
        />
      </div>

      <div className="mt-4">
        <Button type="button" variant="secondary" onClick={onDelete}>
          Delete phase
        </Button>
      </div>
    </div>
  );
}
