"use client";

import { useState } from "react";
import { PhaseKindZoneDefaultsEditor } from "@/components/simple-planner/zone-split-editor";
import { Button } from "@/components/ui";
import type { PhaseKindZoneDefaults } from "@/lib/plan/season/zone-split-types";

type ZoneFocusSettingsPanelProps = {
  initialDefaults: PhaseKindZoneDefaults;
};

async function persistPhaseKindZoneDefaults(
  phaseKindZoneDefaults: PhaseKindZoneDefaults
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "phase-kind-zone-defaults", data: phaseKindZoneDefaults }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save zone focus defaults" };
}

export function ZoneFocusSettingsPanel({ initialDefaults }: ZoneFocusSettingsPanelProps) {
  const [saved, setSaved] = useState(initialDefaults);
  const [draft, setDraft] = useState(initialDefaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await persistPhaseKindZoneDefaults(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(draft);
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Default TiZ % by phase kind for <strong>new</strong> seasons. Existing seasons keep their
        saved values unless you change them on the plan page.
      </p>
      <PhaseKindZoneDefaultsEditor value={draft} onChange={setDraft} />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saving}
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
