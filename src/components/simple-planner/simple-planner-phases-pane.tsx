"use client";

import { useState, type ReactNode } from "react";
import { Button, Input, Label } from "@/components/ui";
import { NumberEditorInput, TextEditorInput } from "@/components/number-editor-input";
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
import type {
  PhaseKind,
  PlanningMode,
  VolumeProgressionMode,
  WeeklyTemplateKind,
} from "@prisma/client";
import type { LongOffWeekPolicy } from "@prisma/client";
import {
  VOLUME_PROGRESSION_MODE_LABELS,
  VOLUME_PROGRESSION_MODES,
  inferVolumeProgressionMode,
} from "@/lib/plan/season/volume-progression";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";
import type { FormulaTemplateItem } from "@/lib/plan/calendar/template-formula-shape";
import type { PhaseKindZoneDefaults } from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { zoneSplitsForPhase } from "@/lib/plan/season/simple-phase-zone-seed";
import { phaseGenerateBlockersForTemplate } from "@/lib/plan/season/phase-generate-blockers";
import type { SessionFormulaCatalog } from "@/lib/plan/season/base-formulas";
import { formulaForDiscipline } from "@/lib/plan/season/base-formulas";
import {
  TemplateMixReadout,
  formulaLongReadout,
  formulaSeasonPeakPlaceholder,
  formulaVolumeReadout,
  phaseDisciplineStartHours,
} from "@/components/simple-planner/discipline-formula-fields";
import {
  PLANNING_MODE_HELP,
  PLANNING_MODE_LABELS,
  PLANNING_MODES,
  planningModeSeparatesLongVolume,
} from "@/lib/plan/season/planning-mode";
import {
  LONG_OFF_WEEK_POLICIES,
  LONG_OFF_WEEK_POLICY_LABELS,
} from "@/lib/plan/season/long-offweek-policy";
import {
  formatUnassignedWeeks,
  formatWeekRange,
  isAssignedPhase,
  isEmptyPhase,
  setPhaseWeekRange,
} from "@/lib/plan/season/phase-span-utils";
import { phaseRampDefaults, type SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import { distanceMetersFromHoursPace } from "@/lib/plan/season/distance-pace-rollup";
import {
  distanceDisplayToMeters,
  distanceInputLabel,
  distanceMetersToDisplay,
  disciplinePlanningMode,
  exactHoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import { LongWeekScheduleGrid } from "@/components/simple-planner/long-week-schedule-grid";
import type { SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  formatChainedVolumeStartDisplay,
  resolveChainedPhaseVolumeStart,
  resolveStoredStartAfterEdit,
  stripChainedVolumeStartSuffix,
  type ResolvedChainedStart,
} from "@/lib/plan/season/phase-volume-display";

export type WeeklyTemplateOption = {
  id: string;
  name: string;
  category: WeeklyTemplateKind;
  items?: FormulaTemplateItem[];
};

type SimplePlannerPhasesPaneProps = {
  seasonId: string;
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
  formulaCatalog?: SessionFormulaCatalog;
  totalWeeks: number;
  weeks: SimpleWeek[];
  templates: WeeklyTemplateOption[];
  defaultPlanningMode: PlanningMode;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  longRideWeekFlags: boolean[];
  longRunWeekFlags: boolean[];
  selectedPhaseId: string | null;
  onSelectPhase: (phaseId: string | null) => void;
  onPhasesChange: (phases: SimplePhase[]) => void;
  onLongRideWeekFlagsChange: (flags: boolean[]) => void;
  onLongRunWeekFlagsChange: (flags: boolean[]) => void;
  longRideOwnedByProgram?: boolean[];
  longRunOwnedByProgram?: boolean[];
  programWeekHint?: SimpleWeek | null;
  trainerRoadDriven?: boolean;
};

export function SimplePlannerPhasesPane({
  seasonId,
  phases,
  phaseKindZoneDefaults,
  zoneFocusCatalog,
  formulaCatalog = [],
  totalWeeks,
  weeks,
  templates,
  defaultPlanningMode,
  rampDefaults,
  disciplineSettings,
  longRideWeekFlags,
  longRunWeekFlags,
  selectedPhaseId,
  onSelectPhase,
  onPhasesChange,
  onLongRideWeekFlagsChange,
  onLongRunWeekFlagsChange,
  longRideOwnedByProgram = [],
  longRunOwnedByProgram = [],
  programWeekHint = null,
  trainerRoadDriven = false,
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
        {trainerRoadDriven ? null : (
          <Button type="button" variant="secondary" onClick={addEmptyPhase}>
            + Add phase
          </Button>
        )}
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
                {phaseGenerateBlockersForTemplate(phase, templates).length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {phaseGenerateBlockersForTemplate(phase, templates)[0]}
                  </span>
                ) : null}
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
        <div id="phase-workspace-editor">
          <PhaseDetailEditor
            phase={selected}
            phases={phases}
            phaseKindZoneDefaults={phaseKindZoneDefaults}
            zoneFocusCatalog={zoneFocusCatalog}
            formulaCatalog={formulaCatalog}
            totalWeeks={totalWeeks}
            weeks={weeks}
            templates={templates}
            defaultPlanningMode={defaultPlanningMode}
            rampDefaults={rampDefaults}
            disciplineSettings={disciplineSettings}
            longRideWeekFlags={longRideWeekFlags}
            longRunWeekFlags={longRunWeekFlags}
            onLongRideWeekFlagsChange={onLongRideWeekFlagsChange}
            onLongRunWeekFlagsChange={onLongRunWeekFlagsChange}
            longRideOwnedByProgram={longRideOwnedByProgram}
            longRunOwnedByProgram={longRunOwnedByProgram}
            programWeekHint={programWeekHint}
            onChange={updatePhase}
            onDelete={() => deletePhase(selected)}
            phasesLocked={trainerRoadDriven}
          />
          {selected.id ? (
            <MaterializePhasePanel
              seasonId={seasonId}
              phaseId={selected.id}
              phaseName={selected.name}
              canGenerate={phaseGenerateBlockersForTemplate(selected, templates).length === 0}
              blockers={phaseGenerateBlockersForTemplate(selected, templates)}
            />
          ) : (
            <p className="mt-3 text-xs text-zinc-500">
              Save the season to persist this phase before generating sessions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export type PhaseEditorSection = "all" | "shape" | "load" | "intensity" | "layout";

export function PhaseDetailEditor({
  phase,
  phases,
  phaseKindZoneDefaults,
  zoneFocusCatalog,
  formulaCatalog = [],
  totalWeeks,
  weeks,
  templates,
  defaultPlanningMode,
  rampDefaults,
  disciplineSettings,
  longRideWeekFlags,
  longRunWeekFlags,
  onLongRideWeekFlagsChange,
  onLongRunWeekFlagsChange,
  longRideOwnedByProgram = [],
  longRunOwnedByProgram = [],
  programWeekHint = null,
  onChange,
  onDelete,
  phasesLocked = false,
  section = "all",
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
  formulaCatalog?: SessionFormulaCatalog;
  totalWeeks: number;
  weeks: SimpleWeek[];
  templates: WeeklyTemplateOption[];
  defaultPlanningMode: PlanningMode;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  longRideWeekFlags: boolean[];
  longRunWeekFlags: boolean[];
  onLongRideWeekFlagsChange: (flags: boolean[]) => void;
  onLongRunWeekFlagsChange: (flags: boolean[]) => void;
  longRideOwnedByProgram?: boolean[];
  longRunOwnedByProgram?: boolean[];
  programWeekHint?: SimpleWeek | null;
  onChange: (phase: SimplePhase) => void;
  onDelete: () => void;
  phasesLocked?: boolean;
  section?: PhaseEditorSection;
}) {
  const show = (name: Exclude<PhaseEditorSection, "all">) =>
    section === "all" || section === name;
  const assigned = isAssignedPhase(phase);
  const weekLabel = assigned
    ? formatWeekRange(phase.startWeekIndex, phase.endWeekIndex)
    : "Not assigned — use + in Week review or set the week range below";
  const effectiveMode = phase.planningMode ?? defaultPlanningMode;
  const showLongVolumeSettings = planningModeSeparatesLongVolume(effectiveMode);
  const restWeekByIndex = weeks.map((week) => week.isRestWeek);

  return (
    <div className={section === "all" ? "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800" : "space-y-4"}>
      {section === "all" ? <p className="text-sm font-semibold">Editing: {phase.name}</p> : null}

      {show("shape") ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Phase kind</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={phase.phaseKind}
            disabled={phasesLocked}
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
            disabled={phasesLocked}
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
      ) : null}
      {show("load") ? (
        <>
      <PhaseVolumeEditor
        phase={phase}
        phases={phases}
        weeks={weeks}
        effectiveMode={effectiveMode}
        showLongSettings={showLongVolumeSettings}
        rampDefaults={rampDefaults}
        disciplineSettings={disciplineSettings}
        formulaCatalog={formulaCatalog}
        templates={templates}
        onChange={onChange}
        hideBike={phasesLocked}
      />

      <fieldset className="mt-4 space-y-3">
        <legend className="text-sm font-medium">Long sessions</legend>
        <p className="text-xs text-zinc-500">
          {showLongVolumeSettings
            ? "Sessions per week includes the long on long weeks; off-week policy replaces or drops that seat. Long bike/run volume ramps stay outside main hours."
            : "Sessions per week includes the long. Unchecked weeks keep an endurance session instead. Rest and taper weeks omit the long."}
        </p>
        {(() => {
          const bikeReadout = formulaLongReadout(
            formulaCatalog,
            phase.disciplineFormulaIds,
            "BIKE",
            phaseDisciplineStartHours({
              phase,
              phases,
              weeks,
              rampDefaults,
              effectiveMode,
              discipline: "bike",
            })
          );
          const runReadout = formulaLongReadout(
            formulaCatalog,
            phase.disciplineFormulaIds,
            "RUN",
            phaseDisciplineStartHours({
              phase,
              phases,
              weeks,
              rampDefaults,
              effectiveMode,
              discipline: "run",
            })
          );
          return (
            <>
              {bikeReadout ? (
                <p className="text-sm">
                  <span className="font-medium">Long ride. </span>
                  {bikeReadout}
                </p>
              ) : null}
              {runReadout ? (
                <p className="text-sm">
                  <span className="font-medium">Long run. </span>
                  {runReadout}
                </p>
              ) : null}
              {showLongVolumeSettings && !bikeReadout ? (
                <LongDisciplineEditor
                  label="Long ride"
                  startMin={phase.longRideStartMin}
                  endMin={phase.longRideEndMin}
                  offWeekPolicy={phase.longRideOffWeekPolicy ?? "ENDURANCE_PERCENT"}
                  offWeekPercent={phase.longRideOffWeekEndurancePercent ?? 60}
                  onStartMinChange={(value) => onChange({ ...phase, longRideStartMin: value })}
                  onEndMinChange={(value) => onChange({ ...phase, longRideEndMin: value })}
                  onPolicyChange={(value) => onChange({ ...phase, longRideOffWeekPolicy: value })}
                  onPercentChange={(value) =>
                    onChange({ ...phase, longRideOffWeekEndurancePercent: value })
                  }
                  showOffWeekPolicy={false}
                />
              ) : null}
              {showLongVolumeSettings && !runReadout ? (
                <LongDisciplineEditor
                  label="Long run"
                  startMin={phase.longRunStartMin}
                  endMin={phase.longRunEndMin}
                  offWeekPolicy={phase.longRunOffWeekPolicy ?? "ENDURANCE_PERCENT"}
                  offWeekPercent={phase.longRunOffWeekEndurancePercent ?? 60}
                  onStartMinChange={(value) => onChange({ ...phase, longRunStartMin: value })}
                  onEndMinChange={(value) => onChange({ ...phase, longRunEndMin: value })}
                  onPolicyChange={(value) => onChange({ ...phase, longRunOffWeekPolicy: value })}
                  onPercentChange={(value) =>
                    onChange({ ...phase, longRunOffWeekEndurancePercent: value })
                  }
                  showOffWeekPolicy={false}
                />
              ) : null}
            </>
          );
        })()}
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Ramp by discipline</legend>
        {(["swim", "bike", "run"] as const).map((discipline) => {
          const formulaDiscipline =
            discipline === "swim" ? "SWIM" : discipline === "bike" ? "BIKE" : "RUN";
          const formula = formulaForDiscipline(
            formulaCatalog,
            phase.disciplineFormulaIds,
            formulaDiscipline
          );
          return (
          <label key={discipline} className="flex items-center gap-2 text-sm capitalize">
            <input
              type="checkbox"
              checked={formula ? true : phase.rampEnabled[discipline]}
              disabled={Boolean(formula) || (phasesLocked && discipline === "bike")}
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
            {formula ? `${discipline} follows the session formula` : `${discipline} ramp on`}
          </label>
          );
        })}
      </fieldset>

        <details className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
          <div className="mt-3 space-y-4">
          <div>
          <Label>Planning mode</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={phase.planningMode ?? ""}
            onChange={(event) =>
              onChange({
                ...phase,
                planningMode: event.target.value
                  ? (event.target.value as PlanningMode)
                  : null,
              })
            }
          >
            <option value="">
              Season default ({PLANNING_MODE_LABELS[defaultPlanningMode]})
            </option>
            {PLANNING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PLANNING_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">{PLANNING_MODE_HELP[effectiveMode]}</p>
          </div>
          {showLongVolumeSettings ? (
            <>
              {formulaForDiscipline(formulaCatalog, phase.disciplineFormulaIds, "BIKE") ? null : (
              <LongDisciplineEditor
                label="Long ride off-week"
                startMin={phase.longRideStartMin}
                endMin={phase.longRideEndMin}
                offWeekPolicy={phase.longRideOffWeekPolicy ?? "ENDURANCE_PERCENT"}
                offWeekPercent={phase.longRideOffWeekEndurancePercent ?? 60}
                onStartMinChange={(value) => onChange({ ...phase, longRideStartMin: value })}
                onEndMinChange={(value) => onChange({ ...phase, longRideEndMin: value })}
                onPolicyChange={(value) => onChange({ ...phase, longRideOffWeekPolicy: value })}
                onPercentChange={(value) =>
                  onChange({ ...phase, longRideOffWeekEndurancePercent: value })
                }
                minutesHidden
              />
              )}
              {formulaForDiscipline(formulaCatalog, phase.disciplineFormulaIds, "RUN") ? null : (
              <LongDisciplineEditor
                label="Long run off-week"
                startMin={phase.longRunStartMin}
                endMin={phase.longRunEndMin}
                offWeekPolicy={phase.longRunOffWeekPolicy ?? "ENDURANCE_PERCENT"}
                offWeekPercent={phase.longRunOffWeekEndurancePercent ?? 60}
                onStartMinChange={(value) => onChange({ ...phase, longRunStartMin: value })}
                onEndMinChange={(value) => onChange({ ...phase, longRunEndMin: value })}
                onPolicyChange={(value) => onChange({ ...phase, longRunOffWeekPolicy: value })}
                onPercentChange={(value) =>
                  onChange({ ...phase, longRunOffWeekEndurancePercent: value })
                }
                minutesHidden
              />
              )}
            </>
          ) : null}
          </div>
        </details>
        </>
      ) : null}
      {show("layout") ? (
        <div>
          <Label>Weekly template</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={phase.weeklyTemplateId ?? ""}
            onChange={(event) =>
              onChange({
                ...phase,
                weeklyTemplateId: event.target.value ? event.target.value : null,
              })
            }
          >
            <option value="">None — use slot budget only</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({templateCategoryLabel(template.category)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Reusable weekday layout for this phase&apos;s normal weeks. Manage templates in the
            template library.
          </p>
        </div>
      ) : null}

      {show("shape") ? (
        <>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Weeks: <span className="font-medium">{weekLabel}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 md:hidden">
        <div>
          <Label>From week</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={assigned ? phase.startWeekIndex + 1 : ""}
            disabled={phasesLocked}
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
            disabled={phasesLocked}
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
        </>
      ) : null}

      {show("intensity") ? (
        <>
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
          ).map((field) => {
            const formulaDiscipline =
              field.key === "swimSessionsPerWeek"
                ? "SWIM"
                : field.key === "bikeSessionsPerWeek"
                  ? "BIKE"
                  : field.key === "runSessionsPerWeek"
                    ? "RUN"
                    : null;
            const formula = formulaDiscipline
              ? formulaForDiscipline(formulaCatalog, phase.disciplineFormulaIds, formulaDiscipline)
              : null;
            return (
            <div key={field.key}>
              <Label>{field.label}</Label>
              {formula ? (
                <p className="mt-1 text-sm">{formula.sessions.length}</p>
              ) : phasesLocked && field.key === "bikeSessionsPerWeek" ? (
                <p className="mt-1 text-sm text-zinc-500">From TrainerRoad</p>
              ) : (
                <NumberEditorInput
                  min={0}
                  max={7}
                  className="mt-1"
                  value={phase[field.key]}
                  onCommit={(v) => {
                    if (v == null) return;
                    onChange({
                      ...phase,
                      [field.key]: v,
                    });
                  }}
                />
              )}
            </div>
            );
          })}
        </div>
        {programWeekHint?.programSessionCounts &&
        Object.values(programWeekHint.programSessionCounts).some((count) => (count ?? 0) > 0) ? (
          <p className="text-xs text-zinc-500">
            Program this week:
            {[
              ["SWIM", "swim"],
              ["BIKE", "bike"],
              ["RUN", "run"],
              ["STRENGTH", "strength"],
            ]
              .map(([key, label]) => {
                const count =
                  programWeekHint.programSessionCounts?.[
                    key as "SWIM" | "BIKE" | "RUN" | "STRENGTH"
                  ] ?? 0;
                return count ? ` ${label} ${count}` : null;
              })
              .filter(Boolean)
              .join(" ·")}
            . Edits only add extras when leftover-TiZ/hours exist.
          </p>
        ) : null}
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
          ).map((field) => {
            const formulaDiscipline =
              field.key === "swimIntenseDaysPerWeek"
                ? "SWIM"
                : field.key === "bikeIntenseDaysPerWeek"
                  ? "BIKE"
                  : "RUN";
            const formula = formulaForDiscipline(
              formulaCatalog,
              phase.disciplineFormulaIds,
              formulaDiscipline
            );
            const intenseCount = formula
              ? formula.sessions.filter((session) => session.intensity && !session.long).length
              : null;
            return (
            <div key={field.key}>
              <Label>{field.label}</Label>
              {intenseCount != null ? (
                <p className="mt-1 text-sm">{intenseCount}</p>
              ) : phasesLocked && field.key === "bikeIntenseDaysPerWeek" ? (
                <p className="mt-1 text-sm text-zinc-500">From TrainerRoad</p>
              ) : (
                <NumberEditorInput
                  min={0}
                  max={7}
                  className="mt-1"
                  value={phase[field.key]}
                  onCommit={(v) => {
                    if (v == null) return;
                    onChange({
                      ...phase,
                      [field.key]: v,
                    });
                  }}
                />
              )}
            </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Zone focus (TiZ %)</legend>
        <p className="text-xs text-zinc-500">
          Overrides phase-kind defaults for this phase. Choose Custom to ramp between focus presets
          (e.g. Aerobic Base → Threshold) or set manual TiZ %.
        </p>
        <ZoneSplitEditor
          value={zoneSplitsForPhase(phase, phaseKindZoneDefaults)}
          onChange={(zoneSplits) => onChange({ ...phase, zoneSplits })}
          catalog={zoneFocusCatalog}
          showPresetPercents
          showStartEnd
          lockedDisciplines={(["SWIM", "BIKE", "RUN"] as const).filter((discipline) =>
            formulaForDiscipline(formulaCatalog, phase.disciplineFormulaIds, discipline)
          )}
        />
      </fieldset>
        </>
      ) : null}

      {show("layout") && assigned ? (
        <LongWeekScheduleGrid
          startWeekIndex={phase.startWeekIndex}
          endWeekIndex={phase.endWeekIndex}
          phaseKind={phase.phaseKind}
          longRideWeekFlags={longRideWeekFlags}
          longRunWeekFlags={longRunWeekFlags}
          restWeekByIndex={restWeekByIndex}
          longRideOwnedByProgram={longRideOwnedByProgram}
          longRunOwnedByProgram={longRunOwnedByProgram}
          onLongRideWeekFlagsChange={onLongRideWeekFlagsChange}
          onLongRunWeekFlagsChange={onLongRunWeekFlagsChange}
          separatesLongVolume={showLongVolumeSettings}
        />
      ) : null}

      {show("shape") ? (
        <>
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
        {phasesLocked ? null : (
          <Button type="button" variant="secondary" onClick={onDelete}>
            Delete phase
          </Button>
        )}
      </div>
        </>
      ) : null}
    </div>
  );
}

export function PhaseVolumeEditor({
  phase,
  phases,
  weeks,
  effectiveMode,
  showLongSettings,
  rampDefaults,
  disciplineSettings,
  formulaCatalog = [],
  templates = [],
  onChange,
  hideBike = false,
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  effectiveMode: PlanningMode;
  showLongSettings: boolean;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  formulaCatalog?: SessionFormulaCatalog;
  templates?: WeeklyTemplateOption[];
  onChange: (phase: SimplePhase) => void;
  hideBike?: boolean;
}) {
  const progressionMode = inferVolumeProgressionMode(phase);
  const phaseDefaults = phaseRampDefaults(rampDefaults, phase);

  function patchDiscipline(
    discipline: "swim" | "bike" | "run",
    patch: {
      start?: number | null;
      end?: number | null;
      ramp?: number | null;
      step?: number | null;
    }
  ) {
    const keys = {
      swim: ["swimStartHours", "swimEndHours", "swimRampPercent", "swimStepHours"],
      bike: ["bikeStartHours", "bikeEndHours", "bikeRampPercent", "bikeStepHours"],
      run: ["runStartHours", "runEndHours", "runRampPercent", "runStepHours"],
    } as const;
    const [startKey, endKey, rampKey, stepKey] = keys[discipline];
    onChange({
      ...phase,
      ...(patch.start !== undefined ? { [startKey]: patch.start } : {}),
      ...(patch.end !== undefined ? { [endKey]: patch.end } : {}),
      ...(patch.ramp !== undefined ? { [rampKey]: patch.ramp } : {}),
      ...(patch.step !== undefined ? { [stepKey]: patch.step } : {}),
    });
  }

  function formulaFieldsFor(
    discipline: "swim" | "bike" | "run",
    startHours: number | null
  ): FormulaVolumeFieldsProps | null {
    const formulaDiscipline =
      discipline === "swim" ? "SWIM" : discipline === "bike" ? "BIKE" : "RUN";
    const mixItems = templates.find((row) => row.id === phase.weeklyTemplateId)?.items;
    const readout = formulaVolumeReadout(
      formulaCatalog,
      phase.disciplineFormulaIds,
      formulaDiscipline,
      startHours,
      phase,
      rampDefaults,
      mixItems
    );
    if (!readout) return null;
    return {
      readout,
      peakPlaceholder: formulaSeasonPeakPlaceholder(formulaDiscipline, phase, rampDefaults),
    };
  }

  const disciplineLabels: Record<"swim" | "bike" | "run", string> = {
    swim: "Swim",
    bike: showLongSettings ? "Main bike" : "Bike",
    run: showLongSettings ? "Main run" : "Run",
  };

  function setProgressionMode(next: VolumeProgressionMode) {
    onChange({ ...phase, volumeProgressionMode: next });
  }

  const help =
    progressionMode === "PERCENT"
      ? "Compound weekly growth from start (skips rest weeks). Optional end acts as a cap."
      : progressionMode === "STEP"
        ? "Add a fixed amount each training week from start. Optional end acts as a cap."
        : "Linear ramp from start to end across training weeks (rest weeks are skipped, then cut). Blank start chains from the prior phase exit. End hours are the last training week for that sport — not a cap on the whole week, and attached programs replace that sport's hours on covered weeks.";

  return (
    <fieldset className="mt-4 space-y-3">
      <legend className="text-sm font-medium">Phase volume</legend>
      <PhasePlanningUnitsFields
        phase={phase}
        rampDefaults={rampDefaults}
        disciplineSettings={disciplineSettings}
        onChange={onChange}
      />
      <div>
        <Label>Progression</Label>
        <select
          className="mt-1 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={progressionMode}
          onChange={(event) =>
            setProgressionMode(event.target.value as VolumeProgressionMode)
          }
        >
          {VOLUME_PROGRESSION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {VOLUME_PROGRESSION_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">{help}</p>
      </div>

      {effectiveMode === "OVERALL" ? (
        <div className="space-y-3">
        <VolumeProgressionRow
          label="Total hours"
          progressionMode={progressionMode}
          startHours={phase.volumeStartHours}
          endHours={phase.volumeEndHours}
          rampPercent={phase.volumeRampPercent}
          stepHours={phase.volumeStepHours}
          chainedStart={resolveChainedPhaseVolumeStart({
            phase,
            phases,
            weeks,
            rampDefaults,
            effectiveMode,
          })}
          onStartChange={(value) => onChange({ ...phase, volumeStartHours: value })}
          onEndChange={(value) => onChange({ ...phase, volumeEndHours: value })}
          onRampPercentChange={(value) => onChange({ ...phase, volumeRampPercent: value })}
          onStepHoursChange={(value) => onChange({ ...phase, volumeStepHours: value })}
        />
        {( ["swim", "bike", "run"] as const)
          .filter((discipline) => !(hideBike && discipline === "bike"))
          .map((discipline) => {
            const formulaDiscipline =
              discipline === "swim" ? "SWIM" : discipline === "bike" ? "BIKE" : "RUN";
            const startForFormula = phaseDisciplineStartHours({
              phase,
              phases,
              weeks,
              rampDefaults,
              effectiveMode,
              discipline,
            });
            const formula = formulaFieldsFor(discipline, startForFormula);
            return (
              <div
                key={discipline}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <p className="text-sm font-medium capitalize">{discipline}</p>
                {formula ? (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <FormulaGrowthInput
                        value={disciplineRampValue(phase, discipline)}
                        onCommit={(value) => patchDiscipline(discipline, { ramp: value })}
                      />
                      <div>
                        <Label>Peak (h)</Label>
                        <NumberEditorInput
                          min={0}
                          nullable
                          integer={false}
                          className="mt-1"
                          placeholder={formula.peakPlaceholder}
                          value={disciplineEndValue(phase, discipline)}
                          onCommit={(value) => patchDiscipline(discipline, { end: value })}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {formula.readout}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">Uses the phase progression.</p>
                )}
                <TemplateMixReadout
                  discipline={formulaDiscipline}
                  items={templates.find((row) => row.id === phase.weeklyTemplateId)?.items}
                  startHours={startForFormula}
                />
              </div>
            );
          })}
        </div>
      ) : (
        (["swim", "bike", "run"] as const)
          .filter((discipline) => !(hideBike && discipline === "bike"))
          .map((discipline) => {
          const distanceMode =
            discipline !== "bike" && disciplinePlanningMode(discipline, phaseDefaults) === "DISTANCE";
          const paceDiscipline = discipline === "swim" ? "SWIM" : "RUN";
          const def = phaseDefaults[discipline];
          const chainedStart = resolveChainedPhaseVolumeStart({
            phase,
            phases,
            weeks,
            rampDefaults,
            effectiveMode,
            discipline,
          });
          const startHours =
            discipline === "swim"
              ? phase.swimStartHours
              : discipline === "bike"
                ? phase.bikeStartHours
                : phase.runStartHours;
          const endHours =
            discipline === "swim"
              ? phase.swimEndHours
              : discipline === "bike"
                ? phase.bikeEndHours
                : phase.runEndHours;
          const rampPercent =
            discipline === "swim"
              ? phase.swimRampPercent
              : discipline === "bike"
                ? phase.bikeRampPercent
                : phase.runRampPercent;
          const stepHours =
            discipline === "swim"
              ? phase.swimStepHours
              : discipline === "bike"
                ? phase.bikeStepHours
                : phase.runStepHours;

          const formulaDiscipline =
            discipline === "swim" ? "SWIM" : discipline === "bike" ? "BIKE" : "RUN";
          const startForFormula = phaseDisciplineStartHours({
            phase,
            phases,
            weeks,
            rampDefaults,
            effectiveMode,
            discipline,
          });
          const formula = formulaFieldsFor(discipline, startForFormula);

          if (distanceMode) {
            return (
              <VolumeDistanceProgressionRow
                key={discipline}
                label={disciplineLabels[discipline]}
                progressionMode={progressionMode}
                paceDiscipline={paceDiscipline}
                def={def}
                disciplineSettings={disciplineSettings}
                startHours={startHours}
                endHours={endHours}
                rampPercent={rampPercent}
                stepHours={stepHours}
                chainedStart={chainedStart}
                formula={formula}
                formulaSelect={
                  <TemplateMixReadout
                    discipline={formulaDiscipline}
                    items={templates.find((row) => row.id === phase.weeklyTemplateId)?.items}
                    startHours={startForFormula}
                  />
                }
                onStartChange={(hours) => patchDiscipline(discipline, { start: hours })}
                onEndChange={(hours) => patchDiscipline(discipline, { end: hours })}
                onRampPercentChange={(value) => patchDiscipline(discipline, { ramp: value })}
                onStepHoursChange={(hours) => patchDiscipline(discipline, { step: hours })}
              />
            );
          }

          return (
            <VolumeProgressionRow
              key={discipline}
              label={`${disciplineLabels[discipline]} hours`}
              progressionMode={progressionMode}
              startHours={startHours}
              endHours={endHours}
              rampPercent={rampPercent}
              stepHours={stepHours}
              chainedStart={chainedStart}
              formula={formula}
              formulaSelect={
                <TemplateMixReadout
                  discipline={formulaDiscipline}
                  items={templates.find((row) => row.id === phase.weeklyTemplateId)?.items}
                  startHours={startForFormula}
                />
              }
              onStartChange={(value) => patchDiscipline(discipline, { start: value })}
              onEndChange={(value) => patchDiscipline(discipline, { end: value })}
              onRampPercentChange={(value) => patchDiscipline(discipline, { ramp: value })}
              onStepHoursChange={(value) => patchDiscipline(discipline, { step: value })}
            />
          );
        })
      )}
    </fieldset>
  );
}

function VolumeProgressionRow({
  label,
  progressionMode,
  startHours,
  endHours,
  rampPercent,
  stepHours,
  chainedStart,
  formula = null,
  formulaSelect = null,
  onStartChange,
  onEndChange,
  onRampPercentChange,
  onStepHoursChange,
}: {
  label: string;
  progressionMode: VolumeProgressionMode;
  startHours?: number | null;
  endHours?: number | null;
  rampPercent?: number | null;
  stepHours?: number | null;
  chainedStart: ResolvedChainedStart | null;
  formula?: FormulaVolumeFieldsProps | null;
  formulaSelect?: ReactNode;
  onStartChange: (value: number | null) => void;
  onEndChange: (value: number | null) => void;
  onRampPercentChange: (value: number | null) => void;
  onStepHoursChange: (value: number | null) => void;
}) {
  const startDisplay = formatChainedVolumeStartDisplay(
    startHours,
    chainedStart?.kind === "hours" ? chainedStart : null,
    (value) => String(value)
  );

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChainedVolumeStartInput
          label="Start (h)"
          displayValue={startDisplay}
          chainedStart={chainedStart?.kind === "hours" ? chainedStart : null}
          placeholder="Chain from prior phase"
          onCommitStored={onStartChange}
          parseNumeric={(raw) => {
            const value = Number(raw);
            return Number.isFinite(value) && value >= 0 ? value : null;
          }}
        />
        {formula ? (
          <>
            <FormulaGrowthInput value={rampPercent ?? null} onCommit={onRampPercentChange} />
            <div>
              <Label>Peak (h)</Label>
              <NumberEditorInput
                min={0}
                nullable
                integer={false}
                className="mt-1"
                placeholder={formula.peakPlaceholder}
                value={endHours ?? null}
                onCommit={onEndChange}
              />
            </div>
          </>
        ) : progressionMode === "TARGET" ? (
          <div>
            <Label>End (h)</Label>
            <NumberEditorInput
              min={0}
              nullable
              integer={false}
              className="mt-1"
              placeholder="Phase end"
              value={endHours ?? null}
              onCommit={onEndChange}
            />
          </div>
        ) : null}
        {!formula && progressionMode === "PERCENT" ? (
          <>
            <div>
              <Label>Rate / week (%)</Label>
              <NumberEditorInput
                min={0}
                max={100}
                nullable
                integer={false}
                className="mt-1"
                placeholder="e.g. 10"
                value={rampPercent ?? null}
                onCommit={onRampPercentChange}
              />
            </div>
            <div>
              <Label>Cap (h, optional)</Label>
              <NumberEditorInput
                min={0}
                nullable
                integer={false}
                className="mt-1"
                placeholder="Peak cap"
                value={endHours ?? null}
                onCommit={onEndChange}
              />
            </div>
          </>
        ) : null}
        {!formula && progressionMode === "STEP" ? (
          <>
            <div>
              <Label>Step / week (h)</Label>
              <NumberEditorInput
                min={0}
                nullable
                integer={false}
                className="mt-1"
                placeholder="e.g. 0.25"
                value={stepHours ?? null}
                onCommit={onStepHoursChange}
              />
            </div>
            <div>
              <Label>Cap (h, optional)</Label>
              <NumberEditorInput
                min={0}
                nullable
                integer={false}
                className="mt-1"
                placeholder="Peak cap"
                value={endHours ?? null}
                onCommit={onEndChange}
              />
            </div>
          </>
        ) : null}
      </div>
      {formula ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{formula.readout}</p>
      ) : null}
      {formulaSelect}
    </div>
  );
}

function VolumeDistanceProgressionRow({
  label,
  progressionMode,
  paceDiscipline,
  def,
  disciplineSettings,
  startHours,
  endHours,
  rampPercent,
  stepHours,
  chainedStart,
  formula = null,
  formulaSelect = null,
  onStartChange,
  onEndChange,
  onRampPercentChange,
  onStepHoursChange,
}: {
  label: string;
  progressionMode: VolumeProgressionMode;
  paceDiscipline: "SWIM" | "RUN";
  def: SimpleRampDefaults["swim"];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  startHours?: number | null;
  endHours?: number | null;
  rampPercent?: number | null;
  stepHours?: number | null;
  chainedStart: ResolvedChainedStart | null;
  formula?: FormulaVolumeFieldsProps | null;
  formulaSelect?: ReactNode;
  onStartChange: (hours: number | null) => void;
  onEndChange: (hours: number | null) => void;
  onRampPercentChange: (value: number | null) => void;
  onStepHoursChange: (hours: number | null) => void;
}) {
  const unitLabel = distanceInputLabel(paceDiscipline, disciplineSettings).replace("/wk", "");

  function displayFromHours(hours: number | null | undefined): string {
    if (hours == null) return "";
    const meters = distanceMetersFromHoursPace(
      paceDiscipline,
      hours,
      def.referencePaceSeconds
    );
    return distanceMetersToDisplay(meters, paceDiscipline, disciplineSettings);
  }

  function formatMeters(meters: number): string {
    return distanceMetersToDisplay(meters, paceDiscipline, disciplineSettings);
  }

  const startDisplay =
    startHours != null
      ? displayFromHours(startHours)
      : chainedStart?.kind === "meters"
        ? formatChainedVolumeStartDisplay(null, chainedStart, formatMeters)
        : "";

  function commitDistance(raw: string, kind: "start" | "end" | "step") {
    if (!raw.trim()) {
      if (kind === "start") onStartChange(null);
      else if (kind === "end") onEndChange(null);
      else onStepHoursChange(null);
      return;
    }
    const meters = distanceDisplayToMeters(raw, paceDiscipline, disciplineSettings);
    if (meters == null) return;
    const hours = exactHoursFromDisciplineDistance(paceDiscipline, meters, def);
    if (kind === "start") onStartChange(hours);
    else if (kind === "end") onEndChange(hours);
    else onStepHoursChange(hours);
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChainedVolumeStartInput
          label={`${unitLabel} start`}
          displayValue={startDisplay}
          chainedStart={chainedStart}
          placeholder="Chain from prior phase"
          onCommitStored={(parsedMeters) => {
            const storedMeters = resolveStoredStartAfterEdit(parsedMeters, chainedStart);
            if (storedMeters == null) {
              onStartChange(null);
              return;
            }
            onStartChange(
              exactHoursFromDisciplineDistance(paceDiscipline, storedMeters, def)
            );
          }}
          parseNumeric={(raw) =>
            distanceDisplayToMeters(raw, paceDiscipline, disciplineSettings)
          }
        />
        {formula ? (
          <>
            <FormulaGrowthInput value={rampPercent ?? null} onCommit={onRampPercentChange} />
            <div>
              <Label>{unitLabel} peak</Label>
              <TextEditorInput
                inputMode="decimal"
                className="mt-1"
                value={displayFromHours(endHours)}
                placeholder={formula.peakPlaceholder}
                allowEmpty
                onCommit={(raw) => commitDistance(raw, "end")}
              />
            </div>
          </>
        ) : progressionMode === "TARGET" ? (
          <div>
            <Label>{unitLabel} end</Label>
            <TextEditorInput
              inputMode="decimal"
              className="mt-1"
              value={displayFromHours(endHours)}
              placeholder="Phase end"
              allowEmpty
              onCommit={(raw) => commitDistance(raw, "end")}
            />
          </div>
        ) : null}
        {!formula && progressionMode === "PERCENT" ? (
          <>
            <div>
              <Label>Rate / week (%)</Label>
              <NumberEditorInput
                min={0}
                max={100}
                nullable
                integer={false}
                className="mt-1"
                placeholder="e.g. 10"
                value={rampPercent ?? null}
                onCommit={onRampPercentChange}
              />
            </div>
            <div>
              <Label>{unitLabel} cap (optional)</Label>
              <TextEditorInput
                inputMode="decimal"
                className="mt-1"
                value={displayFromHours(endHours)}
                placeholder="Peak cap"
                allowEmpty
                onCommit={(raw) => commitDistance(raw, "end")}
              />
            </div>
          </>
        ) : null}
        {!formula && progressionMode === "STEP" ? (
          <>
            <div>
              <Label>{unitLabel} step / week</Label>
              <TextEditorInput
                inputMode="decimal"
                className="mt-1"
                value={displayFromHours(stepHours)}
                placeholder="e.g. 1"
                allowEmpty
                onCommit={(raw) => commitDistance(raw, "step")}
              />
            </div>
            <div>
              <Label>{unitLabel} cap (optional)</Label>
              <TextEditorInput
                inputMode="decimal"
                className="mt-1"
                value={displayFromHours(endHours)}
                placeholder="Peak cap"
                allowEmpty
                onCommit={(raw) => commitDistance(raw, "end")}
              />
            </div>
          </>
        ) : null}
      </div>
      {formula ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{formula.readout}</p>
      ) : null}
      {formulaSelect}
    </div>
  );
}

type FormulaVolumeFieldsProps = {
  readout: string;
  peakPlaceholder: string;
};

function FormulaGrowthInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
}) {
  return (
    <div>
      <Label>Growth / week (%)</Label>
      <NumberEditorInput
        min={0}
        max={100}
        nullable
        integer={false}
        className="mt-1"
        placeholder="0 (flat)"
        value={value}
        onCommit={onCommit}
      />
    </div>
  );
}

function disciplineRampValue(phase: SimplePhase, discipline: "swim" | "bike" | "run") {
  if (discipline === "swim") return phase.swimRampPercent ?? null;
  if (discipline === "bike") return phase.bikeRampPercent ?? null;
  return phase.runRampPercent ?? null;
}

function disciplineEndValue(phase: SimplePhase, discipline: "swim" | "bike" | "run") {
  if (discipline === "swim") return phase.swimEndHours ?? null;
  if (discipline === "bike") return phase.bikeEndHours ?? null;
  return phase.runEndHours ?? null;
}

const PLANNING_UNIT_ROWS = [
  {
    key: "swim",
    label: "Swim",
    paceDiscipline: "SWIM",
    modeKey: "swimPlanningMode",
    paceKey: "swimReferencePaceSeconds",
  },
  {
    key: "run",
    label: "Run",
    paceDiscipline: "RUN",
    modeKey: "runPlanningMode",
    paceKey: "runReferencePaceSeconds",
  },
] as const;

function PhasePlanningUnitsFields({
  phase,
  rampDefaults,
  disciplineSettings,
  onChange,
}: {
  phase: SimplePhase;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onChange: (phase: SimplePhase) => void;
}) {
  const resolved = phaseRampDefaults(rampDefaults, phase);
  return (
    <div className="space-y-2">
      <Label>Planning units</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANNING_UNIT_ROWS.map((row) => {
          const seasonMode = rampDefaults[row.key].mode;
          const override = phase[row.modeKey] ?? null;
          const paceOverride = phase[row.paceKey] ?? null;
          return (
            <div
              key={row.key}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <p className="text-sm font-medium">{row.label}</p>
              <select
                aria-label={`${row.label} planning unit`}
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={override ?? ""}
                onChange={(event) =>
                  onChange({
                    ...phase,
                    [row.modeKey]: (event.target.value || null) as "HOURS" | "DISTANCE" | null,
                  })
                }
              >
                <option value="">
                  Season ({seasonMode === "DISTANCE" ? "Distance" : "Hours"})
                </option>
                <option value="HOURS">Hours</option>
                <option value="DISTANCE">Distance</option>
              </select>
              <div className="mt-2 flex items-center gap-2">
                <PlannerPaceInput
                  className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={resolved[row.key].referencePaceSeconds}
                  discipline={row.paceDiscipline}
                  disciplineSettings={disciplineSettings}
                  onChange={(seconds) => onChange({ ...phase, [row.paceKey]: seconds })}
                />
                {paceOverride != null ? (
                  <button
                    type="button"
                    className="text-xs text-sky-600 hover:underline"
                    onClick={() => onChange({ ...phase, [row.paceKey]: null })}
                  >
                    Use season
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">Season pace</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">
        Empty uses the season&apos;s planning units from Season → Advanced.
      </p>
    </div>
  );
}

function ChainedVolumeStartInput({
  label,
  displayValue,
  chainedStart,
  placeholder,
  inputMode = "decimal",
  onCommitStored,
  parseNumeric,
}: {
  label: string;
  displayValue: string;
  chainedStart: ResolvedChainedStart | null;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  onCommitStored: (value: number | null) => void;
  parseNumeric: (raw: string) => number | null;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <TextEditorInput
        inputMode={inputMode}
        className="mt-1"
        value={displayValue}
        placeholder={placeholder}
        allowEmpty
        onCommit={(raw) => {
          const cleaned = stripChainedVolumeStartSuffix(raw);
          if (!cleaned) {
            onCommitStored(null);
            return;
          }
          const parsed = parseNumeric(cleaned);
          if (parsed == null) return;
          onCommitStored(resolveStoredStartAfterEdit(parsed, chainedStart));
        }}
      />
    </div>
  );
}

export function LongDisciplineEditor({
  label,
  startMin,
  endMin,
  offWeekPolicy,
  offWeekPercent,
  onStartMinChange,
  onEndMinChange,
  onPolicyChange,
  onPercentChange,
  showOffWeekPolicy = true,
  minutesHidden = false,
}: {
  label: string;
  startMin?: number | null;
  endMin?: number | null;
  offWeekPolicy: LongOffWeekPolicy;
  offWeekPercent: number;
  onStartMinChange: (value: number | null) => void;
  onEndMinChange: (value: number | null) => void;
  onPolicyChange: (value: LongOffWeekPolicy) => void;
  onPercentChange: (value: number) => void;
  showOffWeekPolicy?: boolean;
  minutesHidden?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{label}</p>
      {minutesHidden ? null : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Start (min)</Label>
            <NumberEditorInput
              min={0}
              nullable
              className="mt-1"
              placeholder="Season default"
              value={startMin ?? null}
              onCommit={onStartMinChange}
            />
          </div>
          <div>
            <Label>End (min)</Label>
            <NumberEditorInput
              min={0}
              nullable
              className="mt-1"
              placeholder="Season default"
              value={endMin ?? null}
              onCommit={onEndMinChange}
            />
          </div>
        </div>
      )}
      {showOffWeekPolicy ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Off-week policy</Label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={offWeekPolicy}
              onChange={(event) => onPolicyChange(event.target.value as LongOffWeekPolicy)}
            >
              {LONG_OFF_WEEK_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {LONG_OFF_WEEK_POLICY_LABELS[policy]}
                </option>
              ))}
            </select>
          </div>
          {offWeekPolicy === "ENDURANCE_PERCENT" ? (
            <div>
              <Label>Endurance % of long</Label>
              <NumberEditorInput
                min={0}
                max={100}
                className="mt-1"
                value={offWeekPercent}
                onCommit={(v) => {
                  if (v == null) return;
                  onPercentChange(v);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MaterializePhasePanel({
  seasonId,
  phaseId,
  phaseName,
  canGenerate,
  blockers = [],
}: {
  seasonId: string;
  phaseId: string;
  phaseName: string;
  canGenerate: boolean;
  blockers?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [onlyEmptyWeeks, setOnlyEmptyWeeks] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMaterialize() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(`/api/plan/season/${seasonId}/materialize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId, onlyEmptyWeeks }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(typeof body.error === "string" ? body.error : "Could not generate sessions.");
      return;
    }
    const data = (await res.json()) as {
      weeksMaterialized: number;
      sessionsCreated: number;
      weeksSkipped: number;
    };
    setMessage(
      `Created ${data.sessionsCreated} session${data.sessionsCreated === 1 ? "" : "s"} across ` +
        `${data.weeksMaterialized} week${data.weeksMaterialized === 1 ? "" : "s"} in ${phaseName}` +
        (data.weeksSkipped > 0 ? ` (skipped ${data.weeksSkipped} with existing sessions)` : "") +
        "."
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold">Generate sessions for this phase</p>
      <p className="mt-1 text-xs text-zinc-500">
        Fill calendar weeks in {phaseName} from the assigned phase template (and season
        rest/test templates on flagged weeks). Save the season first so assignments
        are stored.
      </p>
      {!canGenerate ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {blockers.length > 0
            ? blockers.join(". ") + "."
            : "Assign this phase to weeks and choose a weekly template before generating."}
        </p>
      ) : null}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyEmptyWeeks}
          onChange={(event) => setOnlyEmptyWeeks(event.target.checked)}
          disabled={!canGenerate}
        />
        Only fill weeks with no existing sessions
      </label>
      <p className="mt-1 text-xs text-zinc-500">
        {onlyEmptyWeeks
          ? "Weeks that already have any sessions are left untouched."
          : "Previously templated sessions in this phase are replaced; manually added sessions are kept."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void handleMaterialize()}
          disabled={busy || !canGenerate}
        >
          {busy ? "Generating…" : "Generate sessions"}
        </Button>
        {message ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">{message}</span>
        ) : null}
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
