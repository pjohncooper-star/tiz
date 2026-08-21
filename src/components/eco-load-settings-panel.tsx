"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type EcoLoadSettingsPanelProps = {
  initialEnabled: boolean;
};

async function persistEcoLoadEnabled(
  ecoLoadEnabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "eco-load",
      data: { ecoLoadEnabled },
    }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save ECO load setting" };
}

export function EcoLoadSettingsPanel({ initialEnabled }: EcoLoadSettingsPanelProps) {
  const [saved, setSaved] = useState(initialEnabled);
  const [draft, setDraft] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== saved;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await persistEcoLoadEnabled(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(draft);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        ECO (Objective Load Equivalents) scores each swim, bike, and run with one
        comparable load unit. When on, the calendar also shows an end-of-day ECS
        check-in (subjective 0–5 load). ECS appears beside week ECO totals and as
        bars on the fitness/fatigue chart for comparison—it does not feed Banister
        fitness or fatigue. When off, planner and calendar hide all ECO/ECS references.
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
        />
        <span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            Show ECO training load
          </span>
          <span className="mt-0.5 block text-zinc-500">
            Activity ECO scores, weekly ECO/ECS totals, PMC overlay, and Workout
            Signaling load patterns.
          </span>
        </span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="button" disabled={!dirty || saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
