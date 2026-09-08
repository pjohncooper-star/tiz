"use client";

import {
  hoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { useDisciplineSettings } from "@/lib/units/use-discipline-settings";

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

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4">Discipline</th>
            <th className="pb-2 pr-4">Mode</th>
            <th className="pb-2">Reference pace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const def = value[row.key];
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
                <td className="py-2">
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
