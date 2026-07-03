"use client";

import { DeLoadWeekChart } from "@/components/season/de-load-week-chart";
import { LongSessionWeekChart } from "@/components/season/long-session-week-chart";
import {
  VOLUME_MESOCYCLE_MODE_LABELS,
  VOLUME_MESOCYCLE_MODES,
  type VolumeMesocycleMode,
} from "@/components/season/season-settings-types";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
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
    longRideStartMin,
    setLongRideStartMin,
    longRidePeakMin,
    setLongRidePeakMin,
    longRunStartMin,
    setLongRunStartMin,
    longRunPeakMin,
    setLongRunPeakMin,
    updatePhase,
    resolvedPhaseTargets,
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
