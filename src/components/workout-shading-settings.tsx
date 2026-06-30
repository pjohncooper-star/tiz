"use client";

import { useState } from "react";
import type { Discipline } from "@prisma/client";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  buildWorkoutShadingSettings,
  type WorkoutShadingMode,
  type WorkoutShadingSettings,
  workoutShadingOptionsForDiscipline,
} from "@/lib/plan/workout-shading";
import { Button, Label, Select } from "@/components/ui";

const SHADING_DISCIPLINES: Discipline[] = ["BIKE", "RUN", "SWIM", "STRENGTH"];

type WorkoutShadingSettingsPanelProps = {
  initialSettings: WorkoutShadingSettings;
};

async function persistWorkoutShading(
  discipline: Discipline,
  pastWorkoutShading: WorkoutShadingMode
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "workout-shading",
      data: { discipline, pastWorkoutShading },
    }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save workout shading" };
}

export function WorkoutShadingSettingsPanel({
  initialSettings,
}: WorkoutShadingSettingsPanelProps) {
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = SHADING_DISCIPLINES.some((d) => draft[d] !== saved[d]);

  async function handleSave() {
    const toSave = SHADING_DISCIPLINES.filter((d) => draft[d] !== saved[d]);
    if (toSave.length === 0) return;

    setSaving(true);
    setError(null);

    for (const discipline of toSave) {
      const result = await persistWorkoutShading(discipline, draft[discipline]);
      if (!result.ok) {
        setSaving(false);
        setError(result.error);
        return;
      }
    }

    setSaved(draft);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Shade past planned workout cards on the calendar by comparing planned vs completed metrics.
        Within 10% is green, within 25% is amber, outside 25% or not completed is red. Off uses
        gray for past workouts.
      </p>
      {SHADING_DISCIPLINES.map((discipline) => {
        const options = workoutShadingOptionsForDiscipline(discipline);
        return (
          <div
            key={discipline}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {DISCIPLINE_DISPLAY_LABELS[discipline]}
            </p>
            <Label>Past workout shading</Label>
            <Select
              value={draft[discipline]}
              onChange={(e) => {
                setDraft((prev) => ({
                  ...prev,
                  [discipline]: e.target.value as WorkoutShadingMode,
                }));
                setError(null);
              }}
              disabled={saving}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save workout shading"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
