"use client";

import { NumberEditorInput } from "@/components/number-editor-input";
import { Label } from "@/components/ui";
import type { SimplePhase, SimpleSeason } from "@/components/simple-planner/simple-planner-types";
import { isAssignedPhase } from "@/lib/plan/season/phase-span-utils";
import {
  inferVolumeProgressionMode,
  VOLUME_PROGRESSION_MODE_LABELS,
  VOLUME_PROGRESSION_MODES,
} from "@/lib/plan/season/volume-progression";
import type { VolumeProgressionMode } from "@prisma/client";

export function SimplePlannerLoadTable({
  season,
  onSeasonChange,
}: {
  season: SimpleSeason;
  onSeasonChange: (season: SimpleSeason) => void;
}) {
  const phases = season.phases.filter(isAssignedPhase);
  const hideBike = Boolean(season.trainerRoadDriven);

  function updatePhase(updated: SimplePhase) {
    onSeasonChange({
      ...season,
      phases: season.phases.map((phase) =>
        (phase.id ?? phase.name) === (updated.id ?? updated.name) ? updated : phase
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label>Rest week volume</Label>
          <div className="mt-1 flex items-center gap-2">
            <NumberEditorInput
              min={1}
              max={100}
              className="w-24"
              value={season.deLoadVolumePercent}
              onCommit={(next) => {
                if (next == null) return;
                onSeasonChange({
                  ...season,
                  deLoadVolumePercent: Math.min(100, Math.max(1, next)),
                });
              }}
            />
            <span className="text-sm text-zinc-500">% of prior training week</span>
          </div>
        </div>
        <div>
          <Label>Max hours per week</Label>
          <NumberEditorInput
            nullable
            integer={false}
            min={1}
            className="mt-1 w-24"
            value={season.maxWeekHours ?? null}
            onCommit={(maxWeekHours) => onSeasonChange({ ...season, maxWeekHours })}
          />
        </div>
      </div>
      {phases.length === 0 ? (
        <p className="text-sm text-zinc-500">Add phases to set swim and run ramps.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-3"> </th>
                {phases.map((phase) => (
                  <th key={phase.id ?? phase.name} className="pb-2 pr-3 font-medium text-zinc-700 dark:text-zinc-300">
                    {phase.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pr-3 text-xs text-zinc-500">Progression</td>
                {phases.map((phase) => (
                  <td key={`${phase.id}-mode`} className="py-2 pr-3">
                    <select
                      className="w-full min-w-[9rem] rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={inferVolumeProgressionMode(phase)}
                      onChange={(event) =>
                        updatePhase({
                          ...phase,
                          volumeProgressionMode: event.target.value as VolumeProgressionMode,
                        })
                      }
                    >
                      {VOLUME_PROGRESSION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {VOLUME_PROGRESSION_MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
              {(["swim", "bike", "run"] as const)
                .filter((discipline) => !(hideBike && discipline === "bike"))
                .map((discipline) => (
                <tr key={discipline} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-3 font-medium capitalize">{discipline} start (h)</td>
                  {phases.map((phase) => {
                    const startKey =
                      discipline === "swim"
                        ? "swimStartHours"
                        : discipline === "bike"
                          ? "bikeStartHours"
                          : "runStartHours";
                    const rampKey =
                      discipline === "swim"
                        ? "swimRampPercent"
                        : discipline === "bike"
                          ? "bikeRampPercent"
                          : "runRampPercent";
                    const endKey =
                      discipline === "swim"
                        ? "swimEndHours"
                        : discipline === "bike"
                          ? "bikeEndHours"
                          : "runEndHours";
                    const mode = inferVolumeProgressionMode(phase);
                    return (
                      <td key={`${phase.id}-${discipline}`} className="py-2 pr-3">
                        <div className="flex flex-col gap-1">
                          <NumberEditorInput
                            min={0}
                            nullable
                            integer={false}
                            className="w-20"
                            placeholder="chain"
                            value={phase[startKey] ?? null}
                            onCommit={(value) => updatePhase({ ...phase, [startKey]: value })}
                          />
                          {mode === "PERCENT" ? (
                            <NumberEditorInput
                              min={0}
                              max={100}
                              nullable
                              integer={false}
                              className="w-20"
                              placeholder="%/wk"
                              value={phase[rampKey] ?? null}
                              onCommit={(value) => updatePhase({ ...phase, [rampKey]: value })}
                            />
                          ) : (
                            <NumberEditorInput
                              min={0}
                              nullable
                              integer={false}
                              className="w-20"
                              placeholder="end/cap"
                              value={phase[endKey] ?? null}
                              onCommit={(value) => updatePhase({ ...phase, [endKey]: value })}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {hideBike ? (
                <tr className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-3 font-medium">Bike</td>
                  {phases.map((phase) => (
                    <td key={`${phase.id}-bike`} className="py-2 pr-3 text-xs text-zinc-500">
                      From TrainerRoad
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">
            End hours are the last training week for that sport. Week totals also include
            other sports{hideBike ? " and TrainerRoad bike" : ""}. Attached programs replace
            the hours they own.
          </p>
          {hideBike ? (
            <p className="mt-1 text-xs text-zinc-500">
              Bike hours on the volume chart come from your TrainerRoad feed, not the
              season’s 4→8 hour default ramp.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
