"use client";

import { AnchorEditor } from "@/components/season/anchor-editor";
import { CycleStructurePreview } from "@/components/season/cycle-structure-preview";
import { DeLoadWeekChart } from "@/components/season/de-load-week-chart";
import { GoalRaceEditor } from "@/components/season/goal-race-editor";
import {
  DISCIPLINE_LABELS,
  formatGoalDisciplines,
  focusLabel,
  PHASE_FOCUSES,
  PHASE_KINDS,
  disciplineFocusesForPhase,
} from "@/components/season/season-settings-types";
import type { SeasonSettingsState } from "@/components/season/use-season-settings";
import { mesocycleWeekTotal } from "@/lib/plan/season/mesocycle-draft";
import { Card, Input, Label, SegmentedControl, Select, Button } from "@/components/ui";
import type { PhaseFocus, PhaseKind } from "@/components/season/season-settings-types";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";

export function SeasonSettingsPanel({
  step,
  state,
}: {
  step: number;
  state: SeasonSettingsState;
}) {
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
    mesocycleLengthWeeks,
    setMesocycleLengthWeeks,
    phases,
    totalWeeks,
    phaseWeekTotal,
    updatePhase,
    updateMesocycle,
    addMesocycle,
    removeMesocycle,
    autoSplitPhaseMesocycles,
    autoSplitAllMesocycles,
    updateDisciplineFocus,
    startHours,
    setStartHours,
    peakHours,
    setPeakHours,
    maxRampPercent,
    setMaxRampPercent,
    longRideStartMin,
    setLongRideStartMin,
    longRidePeakMin,
    setLongRidePeakMin,
    longRunStartMin,
    setLongRunStartMin,
    longRunPeakMin,
    setLongRunPeakMin,
    deLoadEveryNWeeks,
    setDeLoadEveryNWeeks,
    deLoadVolumePercent,
    setDeLoadVolumePercent,
    deLoadStrategy,
    setDeLoadStrategy,
    reduceCountsOnDeLoad,
    setReduceCountsOnDeLoad,
    deLoadWeekFlags,
    toggleDeLoadWeek,
    applyDeLoadCadence,
    resolvedMesocycles,
    cycleStructureValid,
    seasonId,
  } = state;

  if (step === 0) {
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
          </div>

          <GoalRaceEditor
            priority="A"
            required
            value={aRace}
            onChange={setARace}
          />

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

  if (step === 1) {
    const phaseWeeksMismatch = totalWeeks > 0 && phaseWeekTotal !== totalWeeks;
    const weekDelta = totalWeeks - phaseWeekTotal;

    return (
      <Card title="Cycle structure">
        <div className="mb-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <p>Define how your season is divided into training blocks.</p>
          <ul className="list-inside list-disc space-y-1 text-zinc-500">
            <li>Adjust weeks per macro block so the total matches your season length.</li>
            <li>Add, remove, or resize mesocycles within each block (sub-blocks like Base I, Base II).</li>
            <li>Use mesocycle length to auto-split blocks, or edit them manually below.</li>
            <li>Training focus, volume, and workouts are set on later pages.</li>
          </ul>
        </div>

        <CycleStructurePreview
          phases={phases}
          mesocycleLengthWeeks={mesocycleLengthWeeks}
          totalWeeks={totalWeeks}
        />

        <div className="mb-4 mt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Label>Mesocycle length (weeks)</Label>
            <Input
              type="number"
              min={2}
              max={6}
              value={mesocycleLengthWeeks}
              onChange={(e) => setMesocycleLengthWeeks(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Default block size when auto-splitting (e.g. 4 → Base I, Base II).
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => autoSplitAllMesocycles()}>
            Auto-split all mesocycles
          </Button>
        </div>

        {phaseWeeksMismatch && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {weekDelta > 0
              ? `Add ${weekDelta} week${weekDelta === 1 ? "" : "s"} across phases to match your season.`
              : `Remove ${Math.abs(weekDelta)} week${Math.abs(weekDelta) === 1 ? "" : "s"} across phases to match your season.`}
          </p>
        )}

        {!phaseWeeksMismatch && totalWeeks > 0 && (
          <p
            className={`mb-3 text-sm ${
              phases.every((p) => mesocycleWeekTotal(p.mesocycles) === p.weekCount)
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }`}
          >
            Phase weeks total: {phaseWeekTotal} / {totalWeeks}
            {phases.every((p) => mesocycleWeekTotal(p.mesocycles) === p.weekCount)
              ? " — ready to save"
              : " — adjust mesocycle weeks in each phase"}
          </p>
        )}

        {totalWeeks <= 0 && (
          <p className="mb-3 text-sm text-zinc-500">
            Phase weeks total: {phaseWeekTotal}
          </p>
        )}

        <div className="space-y-4">
          {phases.map((phase, i) => {
            const mesoTotal = mesocycleWeekTotal(phase.mesocycles);
            const mesoMismatch = mesoTotal !== phase.weekCount;
            return (
            <div
              key={phase.id ?? i}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={phase.name}
                    onChange={(e) => updatePhase(i, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Kind</Label>
                  <Select
                    value={phase.phaseKind}
                    onChange={(e) => updatePhase(i, { phaseKind: e.target.value as PhaseKind })}
                  >
                    {PHASE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Controls volume ramp and swim/bike/run mix for weeks in this block.
                  </p>
                </div>
                <div>
                  <Label>Weeks</Label>
                  <Input
                    type="number"
                    min={1}
                    value={phase.weekCount}
                    onChange={(e) => updatePhase(i, { weekCount: Number(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Number of consecutive weeks in this block.
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Mesocycles</p>
                    <p
                      className={`text-xs ${
                        mesoMismatch ? "text-red-600 dark:text-red-400" : "text-zinc-500"
                      }`}
                    >
                      {mesoTotal} / {phase.weekCount} weeks in mesocycles
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => autoSplitPhaseMesocycles(i)}
                    >
                      Auto-split
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => addMesocycle(i)}>
                      Add mesocycle
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(phase.mesocycles ?? []).map((meso, mi) => (
                    <div
                      key={meso.id ?? `${i}-${mi}`}
                      className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]"
                    >
                      <Input
                        value={meso.name}
                        onChange={(e) => updateMesocycle(i, mi, { name: e.target.value })}
                        aria-label="Mesocycle name"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={meso.weekCount}
                        onChange={(e) =>
                          updateMesocycle(i, mi, { weekCount: Number(e.target.value) })
                        }
                        aria-label="Mesocycle weeks"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={(phase.mesocycles?.length ?? 0) <= 1}
                        onClick={() => removeMesocycle(i, mi)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </Card>
    );
  }

  if (step === 2) {
    return (
      <Card title="De-load cadence">
        {!cycleStructureValid && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {totalWeeks > 0 && phaseWeekTotal !== totalWeeks
              ? `Phase weeks (${phaseWeekTotal}) do not match season length (${totalWeeks} weeks).`
              : "Mesocycle weeks must match each phase before setting de-load cadence."}{" "}
            Fix cycle structure first.
          </p>
        )}
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>De-load every N weeks</Label>
              <Input
                type="number"
                min={2}
                max={8}
                value={deLoadEveryNWeeks}
                disabled={!cycleStructureValid}
                onChange={(e) => setDeLoadEveryNWeeks(Number(e.target.value))}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!cycleStructureValid}
              onClick={() => applyDeLoadCadence()}
            >
              Reset to cadence
            </Button>
          </div>

          {cycleStructureValid && (
            <DeLoadWeekChart
              mesocycles={resolvedMesocycles}
              phases={phases}
              totalWeeks={totalWeeks}
              deLoadWeekFlags={deLoadWeekFlags}
              deLoadVolumePercent={deLoadVolumePercent}
              onToggleWeek={toggleDeLoadWeek}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>De-load volume %</Label>
              <Input
                type="number"
                min={30}
                max={90}
                value={deLoadVolumePercent}
                onChange={(e) => setDeLoadVolumePercent(Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>De-load strategy</Label>
              <Select
                value={deLoadStrategy}
                onChange={(e) => setDeLoadStrategy(e.target.value as typeof deLoadStrategy)}
              >
                <option value="VOLUME_ONLY">Volume only</option>
                <option value="VOLUME_AND_INTENSITY">Volume & intensity</option>
                <option value="SINGLE_SPORT_FOCUS">Single sport focus</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={reduceCountsOnDeLoad}
                onChange={(e) => setReduceCountsOnDeLoad(e.target.checked)}
              />
              Reduce session counts on de-load weeks
            </label>
          </div>
        </div>
      </Card>
    );
  }

  if (step === 3) {
    return (
      <Card title="Goals & focus">
        <div className="space-y-4">
          {phases.map((phase, i) => (
            <div
              key={phase.id ?? i}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="mb-3 font-medium">{phase.name}</p>
              <div className="mb-3">
                <Label>Focus mode</Label>
                <SegmentedControl
                  value={phase.focusMode}
                  onChange={(v) => updatePhase(i, { focusMode: v })}
                  options={[
                    { value: "PHASE" as const, label: "Phase focus" },
                    { value: "DISCIPLINE" as const, label: "By discipline" },
                  ]}
                />
              </div>
              {phase.focusMode === "PHASE" ? (
                <div>
                  <Label>Phase focus</Label>
                  <Select
                    value={phase.phaseFocus ?? "AEROBIC_BASE"}
                    onChange={(e) => updatePhase(i, { phaseFocus: e.target.value as PhaseFocus })}
                  >
                    {PHASE_FOCUSES.map((f) => (
                      <option key={f} value={f}>
                        {focusLabel(f)}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {disciplineFocusesForPhase(phase).map((df) => (
                    <div key={df.discipline}>
                      <Label>{DISCIPLINE_LABELS[df.discipline]} focus</Label>
                      <Select
                        value={df.focus}
                        onChange={(e) =>
                          updateDisciplineFocus(i, df.discipline, e.target.value as PhaseFocus)
                        }
                      >
                        {PHASE_FOCUSES.map((f) => (
                          <option key={f} value={f}>
                            {focusLabel(f)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (step === 4) {
    return (
      <Card title="Volume & ramp">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Starting hours / week</Label>
            <Input
              type="number"
              min={1}
              step={0.5}
              value={startHours}
              onChange={(e) => setStartHours(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Peak hours / week</Label>
            <Input
              type="number"
              min={1}
              step={0.5}
              value={peakHours}
              onChange={(e) => setPeakHours(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Max ramp % / week</Label>
            <Input
              type="number"
              min={0}
              max={25}
              value={maxRampPercent}
              onChange={(e) => setMaxRampPercent(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Long ride start (min)</Label>
            <Input
              type="number"
              value={longRideStartMin}
              onChange={(e) => setLongRideStartMin(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Long ride peak (min)</Label>
            <Input
              type="number"
              value={longRidePeakMin}
              onChange={(e) => setLongRidePeakMin(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Long run start (min)</Label>
            <Input
              type="number"
              value={longRunStartMin}
              onChange={(e) => setLongRunStartMin(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Long run peak (min)</Label>
            <Input
              type="number"
              value={longRunPeakMin}
              onChange={(e) => setLongRunPeakMin(Number(e.target.value))}
            />
          </div>
        </div>
      </Card>
    );
  }

  if (step === 5) {
    return (
      <div className="space-y-6">
        <Card title="Sessions per week">
          <div className="space-y-4">
            {phases.map((phase, i) => (
              <div
                key={phase.id ?? i}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="mb-3 font-medium">{phase.name}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Swim</Label>
                    <Input
                      type="number"
                      min={0}
                      value={phase.swimSessionsPerWeek}
                      onChange={(e) =>
                        updatePhase(i, { swimSessionsPerWeek: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Bike</Label>
                    <Input
                      type="number"
                      min={0}
                      value={phase.bikeSessionsPerWeek}
                      onChange={(e) =>
                        updatePhase(i, { bikeSessionsPerWeek: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Run</Label>
                    <Input
                      type="number"
                      min={0}
                      value={phase.runSessionsPerWeek}
                      onChange={(e) =>
                        updatePhase(i, { runSessionsPerWeek: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                {seasonId && phase.id && (
                  <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Anchor workouts for {phase.name}
                    </p>
                    <AnchorEditor
                      seasonPlanId={seasonId}
                      seasonPhaseId={phase.id}
                      defaultEffectiveFrom={startDate}
                      compact
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
