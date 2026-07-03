"use client";

import { DeLoadWeekChart } from "@/components/season/de-load-week-chart";
import { LongSessionWeekChart } from "@/components/season/long-session-week-chart";
import {
  VOLUME_MESOCYCLE_MODE_LABELS,
  VOLUME_MESOCYCLE_MODES,
  type VolumeMesocycleMode,
} from "@/components/season/season-settings-types";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
import { DEFAULT_DISCIPLINE_SPLIT } from "@/lib/plan/season/constants";
import { phaseKindDefaultSplit } from "@/lib/plan/season/discipline-split-resolve";
import type { DisciplineKey } from "@/lib/plan/season/discipline-volume-ramp";
import { defaultVolumeMesocycleMode } from "@/lib/plan/season/phase-volume-ramp";
import {
  volumeEndFromStartAndRamp,
  volumeRampPercentFromStartAndEnd,
} from "@/lib/plan/season/volume-ramp-triad";
import { Card, Input, Label, Select, Button } from "@/components/ui";

function parseOptionalHours(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseOptionalPercent(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function parseOptionalMinutes(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function computedRunPercent(
  swim: number | null | undefined,
  bike: number | null | undefined,
  run: number | null | undefined
): string {
  if (swim == null && bike == null && run == null) return "—";
  const swimPct = swim ?? 0;
  const bikePct = bike ?? 0;
  const runPct = run ?? Math.max(0, 100 - swimPct - bikePct);
  return String(Math.round(runPct * 10) / 10);
}

const DISCIPLINE_RAMP_ROWS: { key: DisciplineKey; label: string }[] = [
  { key: "swim", label: "Swim" },
  { key: "bike", label: "Bike" },
  { key: "run", label: "Run" },
];

const DISCIPLINE_START_FIELDS = {
  swim: "swimStartHours",
  bike: "bikeStartHours",
  run: "runStartHours",
} as const;

const DISCIPLINE_END_FIELDS = {
  swim: "swimEndHours",
  bike: "bikeEndHours",
  run: "runEndHours",
} as const;

const DISCIPLINE_RAMP_FIELDS = {
  swim: "swimRampPercent",
  bike: "bikeRampPercent",
  run: "runRampPercent",
} as const;

export function VolumeRampDeloadStep({ state }: SeasonSettingsStepProps) {
  const {
    phases,
    cycleStructureValid,
    totalWeeks,
    phaseWeekTotal,
    startHours,
    setStartHours,
    peakHours,
    setPeakHours,
    swimSplitPercent,
    setSwimSplitPercent,
    bikeSplitPercent,
    setBikeSplitPercent,
    runSplitPercent,
    setRunSplitPercent,
    longRideStartMin,
    setLongRideStartMin,
    longRidePeakMin,
    setLongRidePeakMin,
    longRunStartMin,
    setLongRunStartMin,
    longRunPeakMin,
    setLongRunPeakMin,
    updatePhase,
    updateMesocycle,
    resolvedPhaseTargets,
    resolvedDisciplineTargets,
    resolvedMesocycles,
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
    longRideWeekFlags,
    longRunWeekFlags,
    toggleLongRideWeek,
    toggleLongRunWeek,
    applyLongWeekPreset,
    longSessionWeekPreview,
  } = state;

  const rampPhases = phases
    .map((phase, index) => ({ phase, index }))
    .filter(({ phase }) => phase.phaseKind !== "TAPER");

  return (
    <div className="space-y-6">
      <Card title="Volume & ramp">
        {!cycleStructureValid && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {totalWeeks > 0 && phaseWeekTotal !== totalWeeks
              ? `Phase weeks (${phaseWeekTotal}) do not match season length (${totalWeeks} weeks).`
              : "Mesocycle weeks must match each phase before setting volume."}{" "}
            Fix cycle structure first.
          </p>
        )}
        <p className="mb-4 text-sm text-muted-foreground">
          Season start and peak hours seed the first phase and defaults. Per-phase start can chain
          from the prior phase end. Weekly ramp % compounds each week (10h at 10%/wk → 11h, 12.1h, …).
        </p>
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
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Season discipline split</p>
          <p className="text-xs text-muted-foreground">
            Default swim / bike / run mix for the season. Override per mesocycle below. Leave blank
            to use macro-phase defaults.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Swim %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="Phase default"
                value={swimSplitPercent ?? ""}
                onChange={(e) => setSwimSplitPercent(parseOptionalPercent(e.target.value))}
              />
            </div>
            <div>
              <Label>Bike %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="Phase default"
                value={bikeSplitPercent ?? ""}
                onChange={(e) => setBikeSplitPercent(parseOptionalPercent(e.target.value))}
              />
            </div>
            <div>
              <Label>Run %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder={computedRunPercent(swimSplitPercent, bikeSplitPercent, runSplitPercent)}
                value={runSplitPercent ?? ""}
                onChange={(e) => setRunSplitPercent(parseOptionalPercent(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

        {cycleStructureValid && rampPhases.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-medium">Per-phase mesocycle volume</h3>
            {rampPhases.map(({ phase, index }) => {
              const resolved = resolvedPhaseTargets.find((t) => t.phaseIndex === index);
              const resolvedIndex = resolvedPhaseTargets.findIndex(
                (t) => t.phaseIndex === index
              );
              const mode =
                phase.volumeMesocycleMode ??
                defaultVolumeMesocycleMode(phase.phaseKind);
              const priorExit =
                resolvedIndex > 0
                  ? resolvedPhaseTargets[resolvedIndex - 1]?.volumeExit
                  : null;
              const startPlaceholder =
                priorExit != null
                  ? `From previous phase (${priorExit}h)`
                  : `Season start (${startHours}h)`;
              const endPlaceholder = resolved
                ? `Default (${resolved.volumeExit}h)`
                : "Default";
              const effectiveEntry = resolved?.volumeEntry;
              const computedEndFromRamp =
                effectiveEntry != null &&
                phase.volumeRampPercent != null &&
                mode !== "HOLD"
                  ? volumeEndFromStartAndRamp(
                      effectiveEntry,
                      phase.volumeRampPercent,
                      phase.weekCount,
                      mode
                    )
                  : null;
              const computedRampFromEnd =
                effectiveEntry != null && phase.volumeEndHours != null
                  ? volumeRampPercentFromStartAndEnd(
                      effectiveEntry,
                      phase.volumeEndHours,
                      phase.weekCount,
                      mode
                    )
                  : null;
              const rampPlaceholder =
                computedRampFromEnd != null
                  ? `From start & end (${computedRampFromEnd}%/wk)`
                  : mode === "HOLD"
                    ? "0% (hold)"
                    : "e.g. 10";
              const endFromRampPlaceholder =
                computedEndFromRamp != null
                  ? `From ramp (${computedEndFromRamp}h)`
                  : endPlaceholder;

              return (
                <div
                  key={phase.id ?? `${phase.name}-${index}`}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{phase.name}</p>
                      <p className="text-xs text-muted-foreground">{phase.phaseKind}</p>
                    </div>
                    <div className="min-w-[10rem]">
                      <Label>Mesocycle volume mode</Label>
                      <Select
                        value={mode}
                        onChange={(e) =>
                          updatePhase(index, {
                            volumeMesocycleMode: e.target.value as VolumeMesocycleMode,
                          })
                        }
                      >
                        {VOLUME_MESOCYCLE_MODES.map((m) => (
                          <option key={m} value={m}>
                            {VOLUME_MESOCYCLE_MODE_LABELS[m]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Start hours</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        placeholder={startPlaceholder}
                        value={phase.volumeStartHours ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            volumeStartHours: parseOptionalHours(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>End hours</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        placeholder={endFromRampPlaceholder}
                        disabled={mode === "HOLD"}
                        value={phase.volumeEndHours ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            volumeEndHours: parseOptionalHours(e.target.value),
                            volumeRampPercent: null,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Ramp % / week</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        placeholder={rampPlaceholder}
                        disabled={mode === "HOLD"}
                        value={phase.volumeRampPercent ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            volumeRampPercent: parseOptionalPercent(e.target.value),
                            volumeEndHours: null,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Long ride start (min)</Label>
                      <Input
                        type="number"
                        placeholder={
                          resolved ? `Default (${resolved.longRideEntry})` : undefined
                        }
                        value={phase.longRideStartMin ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            longRideStartMin: parseOptionalMinutes(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Long ride end (min)</Label>
                      <Input
                        type="number"
                        placeholder={
                          resolved ? `Default (${resolved.longRideExit})` : undefined
                        }
                        value={phase.longRideEndMin ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            longRideEndMin: parseOptionalMinutes(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Long run start (min)</Label>
                      <Input
                        type="number"
                        placeholder={
                          resolved ? `Default (${resolved.longRunEntry})` : undefined
                        }
                        value={phase.longRunStartMin ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            longRunStartMin: parseOptionalMinutes(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Long run end (min)</Label>
                      <Input
                        type="number"
                        placeholder={
                          resolved ? `Default (${resolved.longRunExit})` : undefined
                        }
                        value={phase.longRunEndMin ?? ""}
                        onChange={(e) =>
                          updatePhase(index, {
                            longRunEndMin: parseOptionalMinutes(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  {resolved &&
                    priorExit != null &&
                    phase.volumeStartHours != null &&
                    Math.abs(phase.volumeStartHours - priorExit) > 0.05 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Start differs from prior phase end ({priorExit}h).
                      </p>
                    )}

                  {(phase.mesocycles?.length ?? 0) > 0 && (
                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-sm font-medium">Mesocycle discipline split</p>
                      <p className="text-xs text-muted-foreground">
                        Blank cells inherit season split, then macro-phase default (
                        {DEFAULT_DISCIPLINE_SPLIT[phase.phaseKind].swim}/
                        {DEFAULT_DISCIPLINE_SPLIT[phase.phaseKind].bike}/
                        {DEFAULT_DISCIPLINE_SPLIT[phase.phaseKind].run}).
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[28rem] text-sm">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                              <th className="pb-2 pr-3 font-medium">Mesocycle</th>
                              <th className="pb-2 pr-3 font-medium">Weeks</th>
                              <th className="pb-2 pr-3 font-medium">Swim %</th>
                              <th className="pb-2 pr-3 font-medium">Bike %</th>
                              <th className="pb-2 font-medium">Run %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {phase.mesocycles!.map((meso, mesoIndex) => {
                              const phaseDefault = phaseKindDefaultSplit(phase.phaseKind);
                              const seasonPlaceholder =
                                swimSplitPercent != null ||
                                bikeSplitPercent != null ||
                                runSplitPercent != null
                                  ? `${swimSplitPercent ?? 0}/${bikeSplitPercent ?? 0}/${computedRunPercent(swimSplitPercent, bikeSplitPercent, runSplitPercent)}`
                                  : `${phaseDefault.swim}/${phaseDefault.bike}/${phaseDefault.run}`;
                              return (
                                <tr key={meso.id ?? `${meso.name}-${mesoIndex}`}>
                                  <td className="py-1 pr-3">{meso.name}</td>
                                  <td className="py-1 pr-3">{meso.weekCount}</td>
                                  <td className="py-1 pr-3">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="h-8"
                                      placeholder={seasonPlaceholder.split("/")[0]}
                                      value={meso.swimSplitPercent ?? ""}
                                      onChange={(e) =>
                                        updateMesocycle(index, mesoIndex, {
                                          swimSplitPercent: parseOptionalPercent(e.target.value),
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="py-1 pr-3">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="h-8"
                                      placeholder={seasonPlaceholder.split("/")[1]}
                                      value={meso.bikeSplitPercent ?? ""}
                                      onChange={(e) =>
                                        updateMesocycle(index, mesoIndex, {
                                          bikeSplitPercent: parseOptionalPercent(e.target.value),
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="py-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      className="h-8"
                                      placeholder={
                                        meso.runSplitPercent != null
                                          ? String(meso.runSplitPercent)
                                          : computedRunPercent(
                                              meso.swimSplitPercent,
                                              meso.bikeSplitPercent,
                                              meso.runSplitPercent
                                            )
                                      }
                                      value={meso.runSplitPercent ?? ""}
                                      onChange={(e) =>
                                        updateMesocycle(index, mesoIndex, {
                                          runSplitPercent: parseOptionalPercent(e.target.value),
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <details className="border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Per-sport hour ramps (optional)
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      When any sport ramp is set, weekly total becomes swim + bike + run. Unset sports
                      use the split above.
                    </p>
                    <div className="mt-3 space-y-4">
                      {DISCIPLINE_RAMP_ROWS.map(({ key, label }) => {
                        const targets = resolvedDisciplineTargets[key];
                        const target = targets.find((t) => t.phaseIndex === index);
                        const targetIndex = targets.findIndex((t) => t.phaseIndex === index);
                        const priorDisciplineExit =
                          targetIndex > 0 ? targets[targetIndex - 1]?.exit : null;
                        const startField = DISCIPLINE_START_FIELDS[key];
                        const endField = DISCIPLINE_END_FIELDS[key];
                        const rampField = DISCIPLINE_RAMP_FIELDS[key];
                        const startValue = phase[startField];
                        const endValue = phase[endField];
                        const rampValue = phase[rampField];
                        const effectiveEntry = target?.entry;
                        const computedEndFromRamp =
                          effectiveEntry != null && rampValue != null && mode !== "HOLD"
                            ? volumeEndFromStartAndRamp(
                                effectiveEntry,
                                rampValue,
                                phase.weekCount,
                                mode
                              )
                            : null;
                        const computedRampFromEnd =
                          effectiveEntry != null && endValue != null
                            ? volumeRampPercentFromStartAndEnd(
                                effectiveEntry,
                                endValue,
                                phase.weekCount,
                                mode
                              )
                            : null;

                        return (
                          <div key={key} className="rounded-md border border-border p-3">
                            <p className="mb-2 text-sm font-medium">{label}</p>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div>
                                <Label>Start hours</Label>
                                <Input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  placeholder={
                                    priorDisciplineExit != null
                                      ? `From prior (${priorDisciplineExit}h)`
                                      : target
                                        ? `Default (${target.entry}h)`
                                        : undefined
                                  }
                                  value={startValue ?? ""}
                                  onChange={(e) =>
                                    updatePhase(index, {
                                      [startField]: parseOptionalHours(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <Label>End hours</Label>
                                <Input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  placeholder={
                                    computedEndFromRamp != null
                                      ? `From ramp (${computedEndFromRamp}h)`
                                      : target
                                        ? `Default (${target.exit}h)`
                                        : undefined
                                  }
                                  disabled={mode === "HOLD"}
                                  value={endValue ?? ""}
                                  onChange={(e) =>
                                    updatePhase(index, {
                                      [endField]: parseOptionalHours(e.target.value),
                                      [rampField]: null,
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <Label>Ramp % / week</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.5}
                                  placeholder={
                                    computedRampFromEnd != null
                                      ? `${computedRampFromEnd}%/wk`
                                      : mode === "HOLD"
                                        ? "0% (hold)"
                                        : undefined
                                  }
                                  disabled={mode === "HOLD"}
                                  value={rampValue ?? ""}
                                  onChange={(e) =>
                                    updatePhase(index, {
                                      [rampField]: parseOptionalPercent(e.target.value),
                                      [endField]: null,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {cycleStructureValid && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-medium">Long sessions</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => applyLongWeekPreset("every_week")}
              >
                Every week (full)
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => applyLongWeekPreset("every_other")}
              >
                Every other week
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => applyLongWeekPreset("default")}
              >
                Reset to defaults
              </Button>
            </div>
            <LongSessionWeekChart
              phases={phases}
              mesocycles={resolvedMesocycles}
              totalWeeks={totalWeeks}
              deLoadWeekFlags={deLoadWeekFlags}
              longRideWeekFlags={longRideWeekFlags}
              longRunWeekFlags={longRunWeekFlags}
              weekPreview={longSessionWeekPreview}
              onToggleRideWeek={toggleLongRideWeek}
              onToggleRunWeek={toggleLongRunWeek}
            />
          </div>
        )}
      </Card>

      <Card title="De-load cadence">
        {!cycleStructureValid && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Fix cycle structure before setting de-load cadence.
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
    </div>
  );
}
