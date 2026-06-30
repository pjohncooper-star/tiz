"use client";

import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  formatGoalDisciplines,
  toggleGoalDiscipline,
  type Discipline,
  type EventPriority,
  type GoalEventDraft,
} from "@/components/season/season-settings-types";
import { Button, Input, Label } from "@/components/ui";
import { GoalTimeInput } from "@/components/goal-time-input";

type GoalRaceEditorProps = {
  priority: EventPriority;
  value: GoalEventDraft;
  onChange: (next: GoalEventDraft) => void;
  onRemove?: (deleteFromCalendar: boolean) => void;
  required?: boolean;
};

export function GoalRaceEditor({
  priority,
  value,
  onChange,
  onRemove,
  required,
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
            <Label>Distance (m)</Label>
            <Input
              type="number"
              min={0}
              step={100}
              value={value.distanceMeters ?? ""}
              onChange={(e) =>
                update({
                  distanceMeters: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="Optional"
            />
          </div>
          <GoalTimeInput
            value={value.estimatedDurationMinutes}
            onChange={(estimatedDurationMinutes) => update({ estimatedDurationMinutes })}
          />
        </div>
      </div>
    </div>
  );
}
