"use client";

import { Button, Input, Label } from "@/components/ui";
import { emptyRace, type SimpleGoalEvent } from "@/components/simple-planner/simple-planner-types";
import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  sortDisciplines,
  toggleGoalDiscipline,
  type Discipline,
} from "@/lib/plan/season/season-types";

export function RaceSection({
  aRace,
  bRaces,
  cRaces,
  onChange,
}: {
  aRace: SimpleGoalEvent;
  bRaces: SimpleGoalEvent[];
  cRaces: SimpleGoalEvent[];
  onChange: (a: SimpleGoalEvent, b: SimpleGoalEvent[], c: SimpleGoalEvent[]) => void;
}) {
  return (
    <div className="space-y-4">
      <RaceEditor
        priority="A"
        value={aRace}
        onChange={(next) => onChange(next, bRaces, cRaces)}
        required
      />
      {bRaces.map((race, index) => (
        <RaceEditor
          key={race.id ?? `b-${index}`}
          priority="B"
          value={race}
          onChange={(next) => {
            const updated = [...bRaces];
            updated[index] = next;
            onChange(aRace, updated, cRaces);
          }}
          onRemove={() => onChange(aRace, bRaces.filter((_, i) => i !== index), cRaces)}
        />
      ))}
      {cRaces.map((race, index) => (
        <RaceEditor
          key={race.id ?? `c-${index}`}
          priority="C"
          value={race}
          onChange={(next) => {
            const updated = [...cRaces];
            updated[index] = next;
            onChange(aRace, bRaces, updated);
          }}
          onRemove={() => onChange(aRace, bRaces, cRaces.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange(aRace, [...bRaces, emptyRace("B")], cRaces)}
        >
          Add B race
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange(aRace, bRaces, [...cRaces, emptyRace("C")])}
        >
          Add C race
        </Button>
      </div>
    </div>
  );
}

export function RaceEditor({
  priority,
  value,
  onChange,
  onRemove,
  required,
}: {
  priority: "A" | "B" | "C";
  value: SimpleGoalEvent;
  onChange: (next: SimpleGoalEvent) => void;
  onRemove?: () => void;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{priority}-race</span>
        {onRemove ? (
          <button
            type="button"
            className="text-sm text-zinc-500 hover:text-red-600"
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name{required ? " *" : ""}</Label>
          <Input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </div>
        <div>
          <Label>Date{required ? " *" : ""}</Label>
          <Input
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label>Disciplines</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {DISCIPLINES.map((discipline) => {
            const active = value.disciplines.includes(discipline);
            return (
              <button
                key={discipline}
                type="button"
                onClick={() => {
                  const next = toggleGoalDiscipline(value.disciplines, discipline);
                  if (next) onChange({ ...value, disciplines: next });
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active
                    ? "bg-sky-600 text-white"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {DISCIPLINE_LABELS[discipline]}
              </button>
            );
          })}
        </div>
        {value.disciplines.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            {sortDisciplines(value.disciplines as Discipline[])
              .map((d) => DISCIPLINE_LABELS[d])
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
