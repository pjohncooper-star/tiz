"use client";

import { useState } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  MAX_SELF_EVAL_FIELDS,
  PRESET_CATALOG,
  PRESET_FIELD_IDS,
  type PresetFieldId,
  type SelfEvalConfig,
  type SelfEvalField,
  validateSelfEvalConfig,
} from "@/lib/survey/self-eval-config";

type SelfEvalSettingsPanelProps = {
  initialConfig: SelfEvalConfig;
};

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

function optionalFields(config: SelfEvalConfig): SelfEvalField[] {
  return config.fields.slice(2);
}

function availablePresets(config: SelfEvalConfig): PresetFieldId[] {
  const used = new Set(config.fields.map((field) => field.id));
  return PRESET_FIELD_IDS.filter((id) => !used.has(id));
}

async function persistSelfEvalConfig(
  config: SelfEvalConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "self-eval", data: config }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save self-eval settings" };
}

export function SelfEvalSettingsPanel({ initialConfig }: SelfEvalSettingsPanelProps) {
  const [saved, setSaved] = useState(initialConfig);
  const [draft, setDraft] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPresetId, setNewPresetId] = useState<PresetFieldId | "">("");
  const [customLabel, setCustomLabel] = useState("");
  const [customMax, setCustomMax] = useState("10");

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const optional = optionalFields(draft);
  const presets = availablePresets(draft);
  const atMax = draft.fields.length >= MAX_SELF_EVAL_FIELDS;

  function updateDraft(next: SelfEvalConfig) {
    setDraft(next);
    setError(null);
  }

  function removeOptionalField(fieldId: string) {
    updateDraft({
      fields: draft.fields.filter((field) => field.id !== fieldId),
    });
  }

  function addPresetField(presetId: PresetFieldId) {
    if (atMax || draft.fields.some((field) => field.id === presetId)) return;
    const preset = PRESET_CATALOG[presetId];
    updateDraft({ fields: [...draft.fields, { ...preset }] });
    setNewPresetId("");
  }

  function addCustomField() {
    if (atMax) return;
    const label = customLabel.trim();
    const max = Number(customMax);
    if (!label || !Number.isInteger(max) || max < 2 || max > 10) {
      setError("Custom field needs a label and max between 2 and 10");
      return;
    }
    updateDraft({
      fields: [
        ...draft.fields,
        { id: cuid(), label, kind: "scale", min: 1, max },
      ],
    });
    setCustomLabel("");
    setCustomMax("10");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const validated = validateSelfEvalConfig(draft);
      const result = await persistSelfEvalConfig(validated);
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
      setSaved(validated);
      setDraft(validated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid self-eval settings");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Configure which fields appear when you evaluate a workout. How it felt and perceived
        effort are always included.
      </p>

      {draft.fields.slice(0, 2).map((field) => (
        <div
          key={field.id}
          className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{field.label}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Required · {field.kind === "feel" ? "5-point feel scale" : "RPE 1–10"}
          </p>
        </div>
      ))}

      {optional.map((field) => (
        <div
          key={field.id}
          className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {field.label}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {field.kind === "text"
                  ? "Free text"
                  : `Scale ${field.min ?? 1}–${field.max ?? 10}`}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-1.5"
              onClick={() => removeOptionalField(field.id)}
              disabled={saving}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}

      {!atMax ? (
        <div className="space-y-3 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Add field</p>
          {presets.length > 0 ? (
            <div>
              <Label>Preset</Label>
              <div className="flex gap-2">
                <Select
                  value={newPresetId}
                  onChange={(event) =>
                    setNewPresetId(event.target.value as PresetFieldId | "")
                  }
                  disabled={saving}
                >
                  <option value="">Choose preset…</option>
                  {presets.map((presetId) => (
                    <option key={presetId} value={presetId}>
                      {PRESET_CATALOG[presetId].label}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!newPresetId || saving}
                  onClick={() => {
                    if (newPresetId) addPresetField(newPresetId);
                  }}
                >
                  Add preset
                </Button>
              </div>
            </div>
          ) : null}

          <div>
            <Label>Custom scale</Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value)}
                placeholder="Field label"
                disabled={saving}
              />
              <Select
                value={customMax}
                onChange={(event) => setCustomMax(event.target.value)}
                disabled={saving}
              >
                {Array.from({ length: 9 }, (_, index) => index + 2).map((max) => (
                  <option key={max} value={max}>
                    1–{max}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={addCustomField}
                disabled={saving}
              >
                Add custom
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Maximum of {MAX_SELF_EVAL_FIELDS} fields reached.</p>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save self-eval fields"}
        </Button>
        {dirty && !saving ? (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        ) : null}
      </div>
    </div>
  );
}
