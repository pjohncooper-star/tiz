"use client";

import { useState } from "react";
import { SwimEquipmentCatalogEditor } from "@/components/swim-equipment-catalog-editor";
import { Button } from "@/components/ui";
import type { SwimEquipmentCatalog } from "@/lib/swim/equipment-catalog";

type SwimEquipmentSettingsPanelProps = {
  initialCatalog: SwimEquipmentCatalog;
};

async function persistCatalog(
  catalog: SwimEquipmentCatalog
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "swim-equipment",
      data: { swimEquipmentCatalog: catalog },
    }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save swim equipment" };
}

export function SwimEquipmentSettingsPanel({
  initialCatalog,
}: SwimEquipmentSettingsPanelProps) {
  const [saved, setSaved] = useState(initialCatalog);
  const [draft, setDraft] = useState(initialCatalog);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await persistCatalog(draft);
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
      <SwimEquipmentCatalogEditor value={draft} onChange={setDraft} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={handleCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
