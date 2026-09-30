"use client";

import { NumberEditorInput, TextEditorInput } from "@/components/number-editor-input";
import {
  distanceDisplayToMeters,
  distanceInputLabel,
  distanceMetersToDisplay,
  hoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { useDisciplineSettings } from "@/lib/units/use-discipline-settings";

const CELL_INPUT_CLASS =
  "w-24 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function SeasonUnitsEditor({
  value,
  disciplineSettings,
  onChange,
}: {
  value: SimpleRampDefaults;
  disciplineSettings: ReturnType<typeof useDisciplineSettings>["disciplineSettings"];
  onChange: (value: SimpleRampDefaults) => void;
}) {
  const rows = [
    { key: "swim" as const, label: "Swim", paceDiscipline: "SWIM" as const },
    { key: "bike" as const, label: "Bike", paceDiscipline: null },
    { key: "run" as const, label: "Run", paceDiscipline: "RUN" as const },
  ];

  function updateDiscipline(
    key: "swim" | "bike" | "run",
    patch: Partial<SimpleRampDefaults["swim"]>
  ) {
    onChange({
      ...value,
      [key]: { ...value[key], ...patch },
    });
  }

  function updatePace(key: "swim" | "run", paceDiscipline: "SWIM" | "RUN", seconds: number) {
    const def = value[key];
    const patch: Partial<SimpleRampDefaults["swim"]> = {
      referencePaceSeconds: seconds,
    };
    if (def.mode === "DISTANCE") {
      patch.startHours = hoursFromDisciplineDistance(paceDiscipline, def.startDistanceMeters, {
        ...def,
        referencePaceSeconds: seconds,
      });
      patch.peakHours = hoursFromDisciplineDistance(paceDiscipline, def.peakDistanceMeters, {
        ...def,
        referencePaceSeconds: seconds,
      });
    }
    updateDiscipline(key, patch);
  }

  function updatePeakDistance(key: "swim" | "run", paceDiscipline: "SWIM" | "RUN", text: string) {
    const meters = distanceDisplayToMeters(text, paceDiscipline, disciplineSettings);
    if (meters == null || meters < 0) return;
    updateDiscipline(key, {
      peakDistanceMeters: meters,
      peakHours: hoursFromDisciplineDistance(paceDiscipline, meters, value[key]),
    });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">Discipline</th>
              <th className="pb-2 pr-4">Mode</th>
              <th className="pb-2 pr-4">Reference pace</th>
              <th className="pb-2">Peak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const def = value[row.key];
              const distancePeak = row.paceDiscipline != null && def.mode === "DISTANCE";
              return (
                <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-4 font-medium">{row.label}</td>
                  <td className="py-2 pr-4">
                    {row.key === "bike" ? (
                      <span className="text-zinc-500">Hours</span>
                    ) : (
                      <select
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={def.mode}
                        onChange={(event) =>
                          updateDiscipline(row.key, {
                            mode: event.target.value as "HOURS" | "DISTANCE",
                          })
                        }
                      >
                        <option value="HOURS">Hours</option>
                        <option value="DISTANCE">Distance</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {row.paceDiscipline ? (
                      <PlannerPaceInput
                        className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={def.referencePaceSeconds}
                        discipline={row.paceDiscipline}
                        disciplineSettings={disciplineSettings}
                        onChange={(seconds) => updatePace(row.key, row.paceDiscipline!, seconds)}
                      />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {distancePeak ? (
                      <div className="flex items-center gap-2">
                        <TextEditorInput
                          ariaLabel={`${row.label} peak distance`}
                          className={CELL_INPUT_CLASS}
                          inputMode="decimal"
                          allowEmpty={false}
                          value={distanceMetersToDisplay(
                            def.peakDistanceMeters,
                            row.paceDiscipline!,
                            disciplineSettings
                          )}
                          validate={(text) =>
                            distanceDisplayToMeters(text, row.paceDiscipline!, disciplineSettings) !=
                            null
                          }
                          onCommit={(text) =>
                            updatePeakDistance(row.key, row.paceDiscipline!, text)
                          }
                        />
                        <span className="text-xs text-zinc-500">
                          {distanceInputLabel(row.paceDiscipline!, disciplineSettings)
                            .replace(/^Distance \(/, "")
                            .replace(/\)$/, "")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <NumberEditorInput
                          ariaLabel={`${row.label} peak hours per week`}
                          className={CELL_INPUT_CLASS}
                          integer={false}
                          min={0}
                          value={def.peakHours}
                          onCommit={(peakHours) => {
                            if (peakHours == null) return;
                            updateDiscipline(row.key, { peakHours });
                          }}
                        />
                        <span className="text-xs text-zinc-500">h/wk</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Season defaults. Each phase can override mode and pace on its Load tab. Peak caps a
        formula sport when its phase has no peak of its own.
      </p>
    </div>
  );
}
