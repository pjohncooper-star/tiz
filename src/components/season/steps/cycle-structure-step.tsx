"use client";

import { CycleStructurePreview } from "@/components/season/cycle-structure-preview";
import { PHASE_KINDS, type PhaseKind } from "@/components/season/season-settings-types";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
import { mesocycleWeekTotal } from "@/lib/plan/season/mesocycle-draft";
import { Card, Input, Label, Select, Button } from "@/components/ui";

export function CycleStructureStep({ state }: SeasonSettingsStepProps) {
  const {
    startDate,
    mesocycleLengthWeeks,
    setMesocycleLengthWeeks,
    phases,
    totalWeeks,
    aRace,
    bRaces,
    cRaces,
    phaseWeekTotal,
    updatePhase,
    resizePhaseBoundary,
    updateMesocycle,
    addMesocycle,
    removeMesocycle,
    autoSplitPhaseMesocycles,
    autoSplitAllMesocycles,
    addPhase,
    removePhase,
    movePhase,
    resetPhasesToSuggested,
  } = state;

  const phaseWeeksMismatch = totalWeeks > 0 && phaseWeekTotal !== totalWeeks;
  const weekDelta = totalWeeks - phaseWeekTotal;

  return (
    <Card title="Cycle structure">
      <div className="mb-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Define how your season is divided into training blocks.</p>
        <ul className="list-inside list-disc space-y-1 text-zinc-500">
          <li>Add, remove, or reorder macro phases — multiple phases of the same kind are allowed.</li>
          <li>Adjust weeks per macro block so the total matches your season length.</li>
          <li>Add, remove, or resize mesocycles within each block (sub-blocks like Base I, Base II).</li>
          <li>Use mesocycle length to auto-split blocks, or edit them manually below.</li>
          <li>Goals, workouts, and volume are set on later steps.</li>
        </ul>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => addPhase()}>
          Add phase
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => resetPhasesToSuggested()}
          disabled={totalWeeks <= 0}
        >
          Reset to suggested layout
        </Button>
      </div>

      <CycleStructurePreview
        phases={phases}
        mesocycleLengthWeeks={mesocycleLengthWeeks}
        totalWeeks={totalWeeks}
        startDate={startDate}
        aRace={aRace}
        bRaces={bRaces}
        cRaces={cRaces}
        onResizeBoundary={resizePhaseBoundary}
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
        <p className="mb-3 text-sm text-zinc-500">Phase weeks total: {phaseWeekTotal}</p>
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Phase {i + 1}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={i === 0}
                    onClick={() => movePhase(i, -1)}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={i === phases.length - 1}
                    onClick={() => movePhase(i, 1)}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={phases.length <= 1}
                    onClick={() => void removePhase(i)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
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
                </div>
                <div>
                  <Label>Weeks</Label>
                  <Input
                    type="number"
                    min={1}
                    value={phase.weekCount}
                    onChange={(e) => updatePhase(i, { weekCount: Number(e.target.value) })}
                  />
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
