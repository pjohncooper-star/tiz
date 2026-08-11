"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import {
  parseRacePaceAnchors,
  serializeRacePaceAnchors,
  type RacePaceAnchors,
} from "@/lib/workout/relative-pace";
import { formatPace, parsePaceInput } from "@/lib/units/pace";

type RacePaceAnchorsSettingsPanelProps = {
  initialAnchors: RacePaceAnchors;
};

const FITNESS_FIELDS: { key: keyof RacePaceAnchors; label: string }[] = [
  { key: "5k", label: "5k pace" },
  { key: "10k", label: "10k pace" },
  { key: "half", label: "Half marathon pace" },
  { key: "marathon", label: "Marathon pace" },
];

const GOAL_FIELDS: { key: keyof RacePaceAnchors; label: string }[] = [
  { key: "goal5k", label: "Goal 5k" },
  { key: "goal10k", label: "Goal 10k" },
  { key: "goalHalf", label: "Goal half" },
  { key: "goalMarathon", label: "Goal marathon" },
];

function secondsToDisplay(sec: number | null | undefined): string {
  if (sec == null || !(sec > 0)) return "";
  return formatPace(sec, "km");
}

function displayToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return parsePaceInput(trimmed);
}

async function persistAnchors(
  anchors: RacePaceAnchors
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "race-pace-anchors",
      data: { racePaceAnchors: serializeRacePaceAnchors(anchors) },
    }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save race paces" };
}

export function RacePaceAnchorsSettingsPanel({
  initialAnchors,
}: RacePaceAnchorsSettingsPanelProps) {
  const [saved, setSaved] = useState(() => parseRacePaceAnchors(initialAnchors));
  const [draft, setDraft] = useState(() => parseRacePaceAnchors(initialAnchors));
  const [text, setText] = useState<Record<string, string>>(() => {
    const a = parseRacePaceAnchors(initialAnchors);
    const out: Record<string, string> = {};
    for (const { key } of [...FITNESS_FIELDS, ...GOAL_FIELDS]) {
      out[key] = secondsToDisplay(a[key]);
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function commitField(key: keyof RacePaceAnchors, raw: string) {
    const sec = displayToSeconds(raw);
    if (raw.trim() && sec == null) {
      setError(`Invalid pace for ${key} — use mm:ss (min/km)`);
      setText((t) => ({ ...t, [key]: secondsToDisplay(draft[key]) }));
      return;
    }
    setError(null);
    setDraft((d) => {
      const next = { ...d };
      if (sec == null) delete next[key];
      else next[key] = sec;
      return next;
    });
    setText((t) => ({ ...t, [key]: sec == null ? "" : secondsToDisplay(sec) }));
  }

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    const result = await persistAnchors(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(draft);
  }

  function handleCancel() {
    setDraft(saved);
    const out: Record<string, string> = {};
    for (const { key } of [...FITNESS_FIELDS, ...GOAL_FIELDS]) {
      out[key] = secondsToDisplay(saved[key]);
    }
    setText(out);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Fitness race paces resolve CSV / plan targets like <code>10k</code> or{" "}
        <code>95%|5k</code>. Update these after a race or time trial — upcoming
        calendar workouts that use relative pace retarget automatically (no need to
        re-apply the plan). Values are min/km.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FITNESS_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input
              value={text[key] ?? ""}
              placeholder="4:30"
              onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
              onBlur={() => commitField(key, text[key] ?? "")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        ))}
      </div>
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Goal paces (optional — for marathon-pace prescriptions that track a goal)
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {GOAL_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input
              value={text[key] ?? ""}
              placeholder="5:00"
              onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
              onBlur={() => commitField(key, text[key] ?? "")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
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
