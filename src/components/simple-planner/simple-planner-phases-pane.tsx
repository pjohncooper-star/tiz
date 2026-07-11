"use client";

import { addWeeks, format } from "date-fns";
import { Button, Input, Label } from "@/components/ui";
import { PlannerNumberInput } from "@/components/simple-planner/planner-number-input";
import { parseDateKey } from "@/lib/dates";
import { type SimplePhase } from "@/components/simple-planner/simple-planner-types";
import {
  defaultVolumeSettingsForPhaseName,
  type LongSessionCadence,
  type SimplePhaseVolumeTrend,
} from "@/lib/plan/season/phase-volume-settings";
import {
  deletePhaseWithMerge,
  formatWeekRange,
  isAssignedPhase,
  normalizePhasesToFullCoverage,
  setPhaseWeekRange,
  splitLongestPhase,
} from "@/lib/plan/season/phase-span-utils";

type SimplePlannerPhasesPaneProps = {
  seasonPlanId?: string;
  seasonStartDate: string;
  phases: SimplePhase[];
  totalWeeks: number;
  selectedPhaseId: string | null;
  onSelectPhase: (phaseId: string | null) => void;
  onPhasesChange: (phases: SimplePhase[]) => void;
};

export function SimplePlannerPhasesPane({
  seasonPlanId,
  seasonStartDate,
  phases,
  totalWeeks,
  selectedPhaseId,
  onSelectPhase,
  onPhasesChange,
}: SimplePlannerPhasesPaneProps) {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const selected =
    covered.find((phase) => phase.id === selectedPhaseId) ??
    covered.find((phase) => !phase.id && selectedPhaseId === phase.name) ??
    null;

  function updatePhase(updated: SimplePhase) {
    onPhasesChange(
      covered.map((phase) =>
        (phase.id ?? phase.name) === (updated.id ?? updated.name) ? updated : phase
      )
    );
  }

  async function deletePhase(phase: SimplePhase) {
    if (!phase.id) return;
    let message = `Remove "${phase.name}" and merge its weeks into a neighbor?`;
    if (seasonPlanId) {
      const res = await fetch(
        `/api/plan/anchors?seasonPlanId=${encodeURIComponent(seasonPlanId)}`
      );
      if (res.ok) {
        const data = (await res.json()) as { anchors: { seasonPhaseId: string | null }[] };
        const anchorCount = data.anchors.filter((anchor) => anchor.seasonPhaseId === phase.id).length;
        if (anchorCount > 0) {
          message = `Remove "${phase.name}" and delete ${anchorCount} anchor workout${anchorCount === 1 ? "" : "s"}?`;
        }
      }
    }
    if (!window.confirm(message)) return;
    const next = deletePhaseWithMerge(covered, phase.id, totalWeeks);
    onPhasesChange(next);
    if (selectedPhaseId === phase.id) onSelectPhase(null);
  }

  function addPhase() {
    const next = splitLongestPhase(covered, totalWeeks);
    if (next.length === covered.length) return;
    const added = next.find(
      (phase) => !covered.some((item) => (item.id ?? item.name) === (phase.id ?? phase.name))
    );
    const seeded = added
      ? {
          ...added,
          ...defaultVolumeSettingsForPhaseName(added.name),
        }
      : null;
    onPhasesChange(
      seeded
        ? next.map((phase) => (phase.id === seeded.id ? seeded : phase))
        : next
    );
    onSelectPhase(seeded?.id ?? added?.id ?? null);
  }

  const assignedPhases = covered.filter(isAssignedPhase);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Phases are week ranges across your season — not separate calendar events. Week 1 starts
        on your season start date (under Season). Select a phase below to set its weeks, or drag
        phase edges in the Weekly volume table.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={addPhase}>
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
      </div>

      {selected && (
        <PhaseDetailEditor
          phase={selected}
          phases={covered}
          totalWeeks={totalWeeks}
          seasonStartDate={seasonStartDate}
          onChange={updatePhase}
          onDelete={() => void deletePhase(selected)}
        />
      )}
    </div>
  );
}

function formatPhaseCalendarRange(
  seasonStartDate: string,
  startWeekIndex: number,
  endWeekIndex: number
): string {
  const seasonStart = parseDateKey(seasonStartDate);
  const rangeStart = addWeeks(seasonStart, startWeekIndex);
  const rangeEnd = addWeeks(seasonStart, endWeekIndex);
  rangeEnd.setDate(rangeEnd.getDate() + 6);
  return `${format(rangeStart, "MMM d, yyyy")} – ${format(rangeEnd, "MMM d, yyyy")}`;
}

function PhaseDetailEditor({
  phase,
  phases,
  totalWeeks,
  seasonStartDate,
  onChange,
  onDelete,
}: {
  phase: SimplePhase;
  phases: SimplePhase[];
  totalWeeks: number;
  seasonStartDate: string;
  onChange: (phase: SimplePhase) => void;
  onDelete: () => void;
}) {
  const weekLabel = formatWeekRange(phase.startWeekIndex, phase.endWeekIndex);
  const calendarLabel = formatPhaseCalendarRange(
    seasonStartDate,
    phase.startWeekIndex,
    phase.endWeekIndex
  );

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold">Editing: {phase.name}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Label</Label>
          <Input
            className="mt-1"
            value={phase.name}
            onChange={(event) => onChange({ ...phase, name: event.target.value })}
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
        Span: <span className="font-medium">{weekLabel}</span>
        <span className="text-zinc-400"> · </span>
        <span className="font-medium">{calendarLabel}</span>
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>From week</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={phase.startWeekIndex + 1}
            onChange={(event) => {
              const start = Number(event.target.value) - 1;
              onChange(setPhaseWeekRange(phase, phases, totalWeeks, start, phase.endWeekIndex));
            }}
          >
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
            value={phase.endWeekIndex + 1}
            onChange={(event) => {
              const end = Number(event.target.value) - 1;
              onChange(setPhaseWeekRange(phase, phases, totalWeeks, phase.startWeekIndex, end));
            }}
          >
            {Array.from({ length: totalWeeks }, (_, index) => (
              <option key={index} value={index + 1}>
                Week {index + 1}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Changing weeks resizes this phase and adjusts neighbors so every week stays covered. On
        desktop you can also drag the top/bottom edge of a phase in the Weekly volume table.
      </p>

      <fieldset className="mt-4 space-y-3">
        <legend className="text-sm font-medium">Volume & recovery</legend>
        <p className="text-xs text-zinc-500">
          Replaces implicit phase-kind behavior. Volume target is percent of season peak hours.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Volume trend</Label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={phase.volumeTrend}
              onChange={(event) =>
                onChange({
                  ...phase,
                  volumeTrend: event.target.value as SimplePhaseVolumeTrend,
                  ...(event.target.value === "TAPER" ? { suppressRecovery: true } : {}),
                })
              }
            >
              <option value="INCREASE">Increase</option>
              <option value="HOLD">Hold</option>
              <option value="DECREASE">Decrease</option>
              <option value="TAPER">Taper</option>
            </select>
          </div>
          <div>
            <Label>Long-session cadence</Label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={phase.longSessionCadence}
              onChange={(event) =>
                onChange({
                  ...phase,
                  longSessionCadence: event.target.value as LongSessionCadence,
                })
              }
            >
              <option value="EVERY_WEEK">Every week</option>
              <option value="EVERY_OTHER">Every other week</option>
              <option value="NONE">None</option>
            </select>
          </div>
        </div>
        {phase.volumeTrend === "TAPER" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Taper start % of peak</Label>
              <PlannerNumberInput
                min={1}
                max={150}
                className="mt-1"
                value={phase.volumeTaperStartPercent}
                onChange={(volumeTaperStartPercent) =>
                  onChange({ ...phase, volumeTaperStartPercent })
                }
              />
            </div>
            <div>
              <Label>Taper end % of peak</Label>
              <PlannerNumberInput
                min={1}
                max={150}
                className="mt-1"
                value={phase.volumeTaperEndPercent}
                onChange={(volumeTaperEndPercent) =>
                  onChange({ ...phase, volumeTaperEndPercent })
                }
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>Volume target % of peak</Label>
            <PlannerNumberInput
              min={1}
              max={150}
              className="mt-1"
              value={phase.volumeTargetPercent}
              onChange={(volumeTargetPercent) =>
                onChange({ ...phase, volumeTargetPercent })
              }
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={phase.suppressRecovery}
            onChange={(event) =>
              onChange({ ...phase, suppressRecovery: event.target.checked })
            }
          />
          Suppress recovery / de-load weeks in this phase
        </label>
      </fieldset>

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
              <PlannerNumberInput
                min={0}
                max={7}
                integer
                className="mt-1"
                value={phase[field.key]}
                onChange={(next) => onChange({ ...phase, [field.key]: next })}
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
              <PlannerNumberInput
                min={0}
                max={7}
                integer
                className="mt-1"
                value={phase[field.key]}
                onChange={(next) => onChange({ ...phase, [field.key]: next })}
              />
            </div>
          ))}
        </div>
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
        <Button
          type="button"
          variant="secondary"
          onClick={onDelete}
          disabled={phases.length <= 1}
        >
          Delete phase
        </Button>
      </div>
    </div>
  );
}
