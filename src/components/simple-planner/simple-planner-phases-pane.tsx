"use client";

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
import type { PhaseKind, PlanningMode, WeeklyTemplateKind } from "@prisma/client";
import type { LongOffWeekPolicy } from "@prisma/client";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";
import type { PhaseKindZoneDefaults } from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { zoneSplitsForPhase } from "@/lib/plan/season/simple-phase-zone-seed";
import {
  PLANNING_MODE_LABELS,
  PLANNING_MODES,
  planningModeIncludesLongs,
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
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import { distanceMetersFromHoursPace } from "@/lib/plan/season/distance-pace-rollup";
import {
  distanceDisplayToMeters,
  distanceInputLabel,
  distanceMetersToDisplay,
  disciplinePlanningMode,
  exactHoursFromDisciplineDistance,
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
};

type SimplePlannerPhasesPaneProps = {
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
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
};

export function SimplePlannerPhasesPane({
  phases,
  phaseKindZoneDefaults,
  zoneFocusCatalog,
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
          weeks={weeks}
          templates={templates}
          defaultPlanningMode={defaultPlanningMode}
          rampDefaults={rampDefaults}
          disciplineSettings={disciplineSettings}
          longRideWeekFlags={longRideWeekFlags}
          longRunWeekFlags={longRunWeekFlags}
          onLongRideWeekFlagsChange={onLongRideWeekFlagsChange}
          onLongRunWeekFlagsChange={onLongRunWeekFlagsChange}
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
  weeks,
  templates,
  defaultPlanningMode,
  rampDefaults,
  disciplineSettings,
  longRideWeekFlags,
  longRunWeekFlags,
  onLongRideWeekFlagsChange,
  onLongRunWeekFlagsChange,
  onChange,
  onDelete,
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
  zoneFocusCatalog: ZoneFocusCatalog;
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
  onChange: (phase: SimplePhase) => void;
  onDelete: () => void;
}) {
  const assigned = isAssignedPhase(phase);
  const weekLabel = assigned
    ? formatWeekRange(phase.startWeekIndex, phase.endWeekIndex)
    : "Not assigned — click + on a week in the table";
  const effectiveMode = phase.planningMode ?? defaultPlanningMode;
  const showLongSettings = planningModeIncludesLongs(effectiveMode);
  const restWeekByIndex = weeks.map((week) => week.isRestWeek);

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
        </div>
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
            </div>
          ))}
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
        />
      </fieldset>

      <PhaseVolumeEditor
        phase={phase}
        phases={phases}
        weeks={weeks}
        effectiveMode={effectiveMode}
        showLongSettings={showLongSettings}
        rampDefaults={rampDefaults}
        disciplineSettings={disciplineSettings}
        onChange={onChange}
      />

      {showLongSettings ? (
        <fieldset className="mt-4 space-y-3">
          <legend className="text-sm font-medium">Long sessions</legend>
          <p className="text-xs text-zinc-500">
            Sessions per week includes the long on long weeks; off-week policy replaces or drops that
            seat. Long bike/run volume ramps stay outside main hours.
          </p>
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
          />
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
          />
          {assigned ? (
            <LongWeekScheduleGrid
              startWeekIndex={phase.startWeekIndex}
              endWeekIndex={phase.endWeekIndex}
              phaseKind={phase.phaseKind}
              longRideWeekFlags={longRideWeekFlags}
              longRunWeekFlags={longRunWeekFlags}
              restWeekByIndex={restWeekByIndex}
              onLongRideWeekFlagsChange={onLongRideWeekFlagsChange}
              onLongRunWeekFlagsChange={onLongRunWeekFlagsChange}
            />
          ) : null}
        </fieldset>
      ) : null}

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

function PhaseVolumeEditor({
  phase,
  phases,
  weeks,
  effectiveMode,
  showLongSettings,
  rampDefaults,
  disciplineSettings,
  onChange,
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  effectiveMode: PlanningMode;
  showLongSettings: boolean;
  rampDefaults: SimpleRampDefaults;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onChange: (phase: SimplePhase) => void;
}) {
  const swimDistance = disciplinePlanningMode("swim", rampDefaults) === "DISTANCE";
  const runDistance = disciplinePlanningMode("run", rampDefaults) === "DISTANCE";
  const usesDistance = swimDistance || runDistance;

  const disciplineLabels: Record<"swim" | "bike" | "run", string> = {
    swim: "Swim",
    bike: showLongSettings ? "Main bike" : "Bike",
    run: showLongSettings ? "Main run" : "Run",
  };

  return (
    <fieldset className="mt-4 space-y-3">
      <legend className="text-sm font-medium">Phase volume</legend>
      <p className="text-xs text-zinc-500">
        {usesDistance
          ? "Start and end targets for this phase. Swim/run use distance from season ramp settings; hours are derived from reference pace. Blank start chains from the prior phase exit."
          : "Start and end hours for this phase. Blank start chains from the prior phase exit. Linear ramp between weeks."}
      </p>
      {effectiveMode === "OVERALL" ? (
        <VolumeHoursRow
          label="Total hours"
          startHours={phase.volumeStartHours}
          endHours={phase.volumeEndHours}
          chainedStart={resolveChainedPhaseVolumeStart({
            phase,
            phases,
            weeks,
            rampDefaults,
            effectiveMode,
          })}
          onStartChange={(value) => onChange({ ...phase, volumeStartHours: value })}
          onEndChange={(value) => onChange({ ...phase, volumeEndHours: value })}
        />
      ) : (
        (["swim", "bike", "run"] as const).map((discipline) => {
          const distanceMode =
            discipline !== "bike" && disciplinePlanningMode(discipline, rampDefaults) === "DISTANCE";
          const paceDiscipline = discipline === "swim" ? "SWIM" : "RUN";
          const def = rampDefaults[discipline];
          const chainedStart = resolveChainedPhaseVolumeStart({
            phase,
            phases,
            weeks,
            rampDefaults,
            effectiveMode,
            discipline,
          });

          if (distanceMode) {
            return (
              <VolumeDistanceRow
                key={discipline}
                label={disciplineLabels[discipline]}
                paceDiscipline={paceDiscipline}
                def={def}
                disciplineSettings={disciplineSettings}
                startHours={
                  discipline === "swim" ? phase.swimStartHours : phase.runStartHours
                }
                endHours={discipline === "swim" ? phase.swimEndHours : phase.runEndHours}
                chainedStart={chainedStart}
                onStartChange={(hours) => {
                  if (discipline === "swim") onChange({ ...phase, swimStartHours: hours });
                  else onChange({ ...phase, runStartHours: hours });
                }}
                onEndChange={(hours) => {
                  if (discipline === "swim") onChange({ ...phase, swimEndHours: hours });
                  else onChange({ ...phase, runEndHours: hours });
                }}
              />
            );
          }

          return (
            <VolumeHoursRow
              key={discipline}
              label={`${disciplineLabels[discipline]} hours`}
              startHours={
                discipline === "swim"
                  ? phase.swimStartHours
                  : discipline === "bike"
                    ? phase.bikeStartHours
                    : phase.runStartHours
              }
              endHours={
                discipline === "swim"
                  ? phase.swimEndHours
                  : discipline === "bike"
                    ? phase.bikeEndHours
                    : phase.runEndHours
              }
              chainedStart={chainedStart}
              onStartChange={(value) => {
                if (discipline === "swim") onChange({ ...phase, swimStartHours: value });
                else if (discipline === "bike") onChange({ ...phase, bikeStartHours: value });
                else onChange({ ...phase, runStartHours: value });
              }}
              onEndChange={(value) => {
                if (discipline === "swim") onChange({ ...phase, swimEndHours: value });
                else if (discipline === "bike") onChange({ ...phase, bikeEndHours: value });
                else onChange({ ...phase, runEndHours: value });
              }}
            />
          );
        })
      )}
    </fieldset>
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

function VolumeDistanceRow({
  label,
  paceDiscipline,
  def,
  disciplineSettings,
  startHours,
  endHours,
  chainedStart,
  onStartChange,
  onEndChange,
}: {
  label: string;
  paceDiscipline: "SWIM" | "RUN";
  def: SimpleRampDefaults["swim"];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  startHours?: number | null;
  endHours?: number | null;
  chainedStart: ResolvedChainedStart | null;
  onStartChange: (hours: number | null) => void;
  onEndChange: (hours: number | null) => void;
}) {
  const startLabel = distanceInputLabel(paceDiscipline, disciplineSettings).replace("/wk", " start");
  const endLabel = distanceInputLabel(paceDiscipline, disciplineSettings).replace("/wk", " end");

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

  function commitDistance(input: string, kind: "start" | "end") {
    if (!input.trim()) {
      if (kind === "start") onStartChange(null);
      else onEndChange(null);
      return;
    }
    const meters = distanceDisplayToMeters(input, paceDiscipline, disciplineSettings);
    if (meters == null) return;
    const hours = exactHoursFromDisciplineDistance(paceDiscipline, meters, def);
    if (kind === "start") onStartChange(hours);
    else onEndChange(hours);
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChainedVolumeStartInput
          label={startLabel}
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
        <div>
          <Label>{endLabel}</Label>
          <TextEditorInput
            inputMode="decimal"
            className="mt-1"
            value={displayFromHours(endHours)}
            placeholder="Phase default"
            allowEmpty
            onCommit={(raw) => commitDistance(raw, "end")}
          />
        </div>
      </div>
    </div>
  );
}

function VolumeHoursRow({
  label,
  startHours,
  endHours,
  chainedStart,
  onStartChange,
  onEndChange,
}: {
  label: string;
  startHours?: number | null;
  endHours?: number | null;
  chainedStart: ResolvedChainedStart | null;
  onStartChange: (value: number | null) => void;
  onEndChange: (value: number | null) => void;
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
        <div>
          <Label>End (h)</Label>
          <NumberEditorInput
            min={0}
            nullable
            integer={false}
            className="mt-1"
            placeholder="Phase default"
            value={endHours ?? null}
            onCommit={onEndChange}
          />
        </div>
      </div>
    </div>
  );
}

function LongDisciplineEditor({
  label,
  startMin,
  endMin,
  offWeekPolicy,
  offWeekPercent,
  onStartMinChange,
  onEndMinChange,
  onPolicyChange,
  onPercentChange,
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
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium">{label}</p>
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
    </div>
  );
}
