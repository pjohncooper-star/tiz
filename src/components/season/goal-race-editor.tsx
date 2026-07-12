"use client";

import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  formatGoalDisciplines,
  sortDisciplines,
  toggleGoalDiscipline,
  type Discipline,
  type EventPriority,
  type GoalEventDraft,
} from "@/components/season/season-settings-types";
import { Button, Input, Label } from "@/components/ui";
import { GoalTimeInput } from "@/components/goal-time-input";
import { useEditableParsedField } from "@/components/simple-planner/planner-number-input";
import {
  goalRaceDistanceDiscipline,
  goalRaceDistanceInputLabel,
  goalRaceDistanceInputToMeters,
  goalRaceDistanceMetersToInput,
} from "@/lib/plan/season/goal-race-distance";
import {
  goalMinutesForDiscipline,
  setDisciplineGoalMinutes,
} from "@/lib/plan/season/goal-event-times";
import {
  DEFAULT_DISCIPLINE_UNIT_SETTINGS,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";

type GoalRaceEditorProps = {
  priority: EventPriority;
  value: GoalEventDraft;
  onChange: (next: GoalEventDraft) => void;
  onRemove?: (deleteFromCalendar: boolean) => void;
  required?: boolean;
  disciplineSettings?: Record<PlanDiscipline, DisciplineUnitSettings>;
};

export function GoalRaceEditor({
  priority,
  value,
  onChange,
  onRemove,
  required,
  disciplineSettings = DEFAULT_DISCIPLINE_UNIT_SETTINGS,
}: GoalRaceEditorProps) {
  function update(patch: Partial<GoalEventDraft>) {
    onChange({ ...value, ...patch });
  }

  function handleRemove() {
    if (!onRemove) return;
    if (!value.id) {
      onRemove(false);
      return;
    }
    const deleteFromCalendar = confirm(
      "Remove this race from the season plan.\n\nOK = also delete from calendar\nCancel = keep on calendar only"
    );
    onRemove(deleteFromCalendar);
  }

  function updateDisciplineGoalTime(discipline: Discipline, minutes: number | null) {
    const nextTimes = setDisciplineGoalMinutes(value, discipline, minutes);
    onChange({ ...value, ...nextTimes });
  }

  const multisport = value.disciplines.length > 1;
  const sortedDisciplines = sortDisciplines(value.disciplines);
  const distanceLabel = goalRaceDistanceInputLabel(value.disciplines, disciplineSettings);
  const distanceUnitDiscipline = goalRaceDistanceDiscipline(value.disciplines);
  const distanceField = useEditableParsedField({
    value: value.distanceMeters ?? 0,
    format: (meters) =>
      goalRaceDistanceMetersToInput(meters > 0 ? meters : null, value.disciplines, disciplineSettings),
    parse: (text) => goalRaceDistanceInputToMeters(text, value.disciplines, disciplineSettings),
    onChange: (distanceMeters) => update({ distanceMeters }),
    allowEmpty: true,
    onEmpty: () => update({ distanceMeters: null }),
  });

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {priority}-race{required ? " (required)" : ""}
        </p>
        {onRemove && (
          <Button type="button" variant="secondary" onClick={handleRemove}>
            Remove
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <Label>Race name</Label>
          <Input
            value={value.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={priority === "A" ? "e.g. Ironman 70.3" : "Race name"}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Race date</Label>
            <Input
              type="date"
              value={value.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </div>
          <div>
            <Label>Disciplines</Label>
            <div className="flex flex-wrap gap-2">
              {DISCIPLINES.map((discipline) => {
                const selected = value.disciplines.includes(discipline);
                return (
                  <button
                    key={discipline}
                    type="button"
                    onClick={() => {
                      const next = toggleGoalDiscipline(value.disciplines, discipline);
                      if (next) update({ disciplines: next });
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      selected
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {DISCIPLINE_LABELS[discipline]}
                  </button>
                );
              })}
            </div>
            {value.disciplines.length > 1 && (
              <p className="mt-1 text-xs text-zinc-500">
                Multisport: {formatGoalDisciplines(value.disciplines)}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{distanceLabel} (optional)</Label>
            <Input
              type="text"
              inputMode="decimal"
              {...distanceField}
              placeholder={
                value.disciplines.includes("SWIM") && value.disciplines.length === 1
                  ? "1500"
                  : "26.2"
              }
            />
            <p className="mt-1 text-xs text-zinc-500">
              Uses your {DISCIPLINE_LABELS[distanceUnitDiscipline as Discipline].toLowerCase()}{" "}
              distance units from settings.
            </p>
          </div>
          {!multisport && (
            <GoalTimeInput
              value={value.estimatedDurationMinutes}
              onChange={(estimatedDurationMinutes) => update({ estimatedDurationMinutes })}
            />
          )}
        </div>
        {multisport && (
          <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Goal time by discipline
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {sortedDisciplines.map((discipline) => (
                <GoalTimeInput
                  key={discipline}
                  label={`${DISCIPLINE_LABELS[discipline]} goal`}
                  value={goalMinutesForDiscipline(value, discipline)}
                  onChange={(minutes) => updateDisciplineGoalTime(discipline, minutes)}
                />
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              Total race time is the sum when all leg times are entered.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
