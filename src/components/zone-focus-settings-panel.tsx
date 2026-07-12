"use client";

import { useState } from "react";
import { PhaseKindZoneDefaultsEditor } from "@/components/simple-planner/zone-split-editor";
import { ZoneFocusCatalogEditor } from "@/components/zone-focus-catalog-editor";
import { Button } from "@/components/ui";
import type { PhaseKindZoneDefaults } from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";

type ZoneFocusSettings = {
  zoneFocusCatalog: ZoneFocusCatalog;
  phaseKindZoneDefaults: PhaseKindZoneDefaults;
};

type ZoneFocusSettingsPanelProps = {
  initialSettings: ZoneFocusSettings;
};

async function persistZoneFocusSettings(
  settings: ZoneFocusSettings
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "zone-focus-settings", data: settings }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save zone focus settings" };
}

export function ZoneFocusSettingsPanel({ initialSettings }: ZoneFocusSettingsPanelProps) {
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await persistZoneFocusSettings(draft);
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
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Zone focus library</h2>
        <ZoneFocusCatalogEditor
          value={draft.zoneFocusCatalog}
          onChange={(zoneFocusCatalog) => setDraft({ ...draft, zoneFocusCatalog })}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Default zone focus by phase kind</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Used when creating <strong>new</strong> seasons. Existing seasons keep their saved values
          unless you change them on the plan page.
        </p>
        <PhaseKindZoneDefaultsEditor
          value={draft.phaseKindZoneDefaults}
          onChange={(phaseKindZoneDefaults) => setDraft({ ...draft, phaseKindZoneDefaults })}
          catalog={draft.zoneFocusCatalog}
          showPresetPercents
        />
      </section>

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
