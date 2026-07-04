"use client";

import { GoalRaceEditor } from "@/components/season/goal-race-editor";
import { formatGoalDisciplines } from "@/components/season/season-settings-types";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
import { Card, Input, Label, Button } from "@/components/ui";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";

export function SeasonSetupStep({ state }: SeasonSettingsStepProps) {
  const {
    name,
    setName,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    aRace,
    setARace,
    bRaces,
    cRaces,
    addBRace,
    addCRace,
    updateBRace,
    updateCRace,
    removeBRace,
    removeCRace,
    unlinkedCalendarRaces,
    importCalendarRace,
    phasesAutoAdjusted,
    totalWeeks,
  } = state;

  return (
    <Card title="Season setup">
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label>Season name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {phasesAutoAdjusted && totalWeeks > 0 && (
            <p className="text-sm text-sky-700 dark:text-sky-400">
              Season length is now {totalWeeks} weeks; base weeks were adjusted to match.
            </p>
          )}
        </div>

        <GoalRaceEditor priority="A" required value={aRace} onChange={setARace} />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">B races</p>
            <Button type="button" variant="secondary" onClick={addBRace}>
              Add B race
            </Button>
          </div>
          {bRaces.length === 0 && (
            <p className="text-sm text-zinc-500">Optional tune-up or secondary-priority races.</p>
          )}
          {bRaces.map((race, i) => (
            <GoalRaceEditor
              key={race.id ?? `b-${i}`}
              priority="B"
              value={race}
              onChange={(next) => updateBRace(i, next)}
              onRemove={(deleteFromCalendar) => removeBRace(i, deleteFromCalendar)}
            />
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">C races</p>
            <Button type="button" variant="secondary" onClick={addCRace}>
              Add C race
            </Button>
          </div>
          {cRaces.length === 0 && (
            <p className="text-sm text-zinc-500">Optional low-priority races or training events.</p>
          )}
          {cRaces.map((race, i) => (
            <GoalRaceEditor
              key={race.id ?? `c-${i}`}
              priority="C"
              value={race}
              onChange={(next) => updateCRace(i, next)}
              onRemove={(deleteFromCalendar) => removeCRace(i, deleteFromCalendar)}
            />
          ))}
        </div>

        {unlinkedCalendarRaces.length > 0 && (
          <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">From calendar</p>
            <p className="text-xs text-zinc-500">
              These races are on your calendar but not linked to this season plan yet.
            </p>
            {unlinkedCalendarRaces.map((session) => (
              <div
                key={session.plannedSessionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{session.name}</p>
                  <p className="text-xs text-zinc-500">
                    {session.date}
                    {session.disciplines.length > 0 &&
                      ` · ${formatGoalDisciplines(session.disciplines)}`}
                    {session.estimatedDurationMinutes != null &&
                      ` · ${formatGoalTimeDisplay(session.estimatedDurationMinutes)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => importCalendarRace(session, "B")}
                  >
                    Add as B
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => importCalendarRace(session, "C")}
                  >
                    Add as C
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
