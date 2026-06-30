"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { WORKOUT_TYPES, workoutTypeLabel } from "@/lib/plan/anchor-workout";

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type AnchorSummary = {
  id: string;
  title: string;
  discipline: string;
  weekday: Weekday;
  durationMinutes: number | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  respectTaper: boolean;
  workoutTemplateId: string | null;
  seasonPlanId?: string | null;
  seasonPhaseId?: string | null;
};

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

type AnchorForm = {
  title: string;
  discipline: string;
  weekday: Weekday;
  durationMinutes: string;
  effectiveFrom: string;
  effectiveUntil: string;
  respectTaper: boolean;
};

function emptyForm(defaultFrom: string): AnchorForm {
  return {
    title: "",
    discipline: "RUN",
    weekday: "MON",
    durationMinutes: "",
    effectiveFrom: defaultFrom,
    effectiveUntil: "",
    respectTaper: true,
  };
}

function formFromAnchor(anchor: AnchorSummary): AnchorForm {
  return {
    title: anchor.title,
    discipline: anchor.discipline,
    weekday: anchor.weekday,
    durationMinutes: anchor.durationMinutes != null ? String(anchor.durationMinutes) : "",
    effectiveFrom: anchor.effectiveFrom,
    effectiveUntil: anchor.effectiveUntil ?? "",
    respectTaper: anchor.respectTaper,
  };
}

function payloadFromForm(form: AnchorForm, seasonPlanId?: string, seasonPhaseId?: string) {
  const duration = form.durationMinutes.trim();
  return {
    title: form.title.trim(),
    discipline: form.discipline,
    weekday: form.weekday,
    durationMinutes: duration ? Number(duration) : null,
    effectiveFrom: form.effectiveFrom,
    effectiveUntil: form.effectiveUntil.trim() || null,
    respectTaper: form.respectTaper,
    seasonPlanId: seasonPlanId ?? null,
    seasonPhaseId: seasonPhaseId ?? null,
  };
}

type AnchorEditorProps = {
  seasonPlanId?: string;
  seasonPhaseId?: string;
  defaultEffectiveFrom?: string;
  compact?: boolean;
};

export function AnchorEditor({
  seasonPlanId,
  seasonPhaseId,
  defaultEffectiveFrom,
  compact = false,
}: AnchorEditorProps) {
  const today = defaultEffectiveFrom ?? format(new Date(), "yyyy-MM-dd");
  const [anchors, setAnchors] = useState<AnchorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AnchorForm>(() => emptyForm(today));
  const [saving, setSaving] = useState(false);

  const loadAnchors = useCallback(async () => {
    setError(null);
    const url = seasonPlanId
      ? `/api/plan/anchors?seasonPlanId=${encodeURIComponent(seasonPlanId)}`
      : "/api/plan/anchors";
    const res = await fetch(url);
    if (!res.ok) {
      setError("Could not load anchor workouts");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { anchors: AnchorSummary[] };
    setAnchors(data.anchors);
    setLoading(false);
  }, [seasonPlanId]);

  useEffect(() => {
    void loadAnchors();
  }, [loadAnchors]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm(today));
    setError(null);
  }

  function startEdit(anchor: AnchorSummary) {
    setEditingId(anchor.id);
    setForm(formFromAnchor(anchor));
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    const body = payloadFromForm(form, seasonPlanId, seasonPhaseId);
    const res = editingId
      ? await fetch(`/api/plan/anchors/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/plan/anchors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    setSaving(false);
    if (!res.ok) {
      setError(editingId ? "Could not update anchor" : "Could not create anchor");
      return;
    }
    setEditingId(null);
    setForm(emptyForm(today));
    await loadAnchors();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this anchor workout?")) return;
    setError(null);
    const res = await fetch(`/api/plan/anchors/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete anchor");
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm(today));
    }
    await loadAnchors();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className={compact ? "space-y-4" : "grid gap-6 lg:grid-cols-2"}>
        <Card title="Anchor workouts">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : anchors.length === 0 ? (
            <p className="text-sm text-zinc-500">No anchor workouts yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {anchors.map((anchor) => (
                <li key={anchor.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{anchor.title}</p>
                    <p className="text-sm text-zinc-500">
                      {WEEKDAY_LABELS[anchor.weekday]} · {workoutTypeLabel(anchor.discipline)}
                      {anchor.durationMinutes != null ? ` · ${anchor.durationMinutes} min` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="secondary" onClick={() => startEdit(anchor)}>
                      Edit
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleDelete(anchor.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={startCreate}>
              Add anchor
            </Button>
          </div>
        </Card>

        <Card title={editingId ? "Edit anchor" : "New anchor"}>
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Tuesday tempo run"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discipline</Label>
                <Select
                  value={form.discipline}
                  onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))}
                >
                  {WORKOUT_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {DISCIPLINE_DISPLAY_LABELS[d]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Weekday</Label>
                <Select
                  value={form.weekday}
                  onChange={(e) => setForm((f) => ({ ...f, weekday: e.target.value as Weekday }))}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAY_LABELS[d]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Duration (minutes, optional)</Label>
              <Input
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Effective until (optional)</Label>
                <Input
                  type="date"
                  value={form.effectiveUntil}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveUntil: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={form.respectTaper}
                onChange={(e) => setForm((f) => ({ ...f, respectTaper: e.target.checked }))}
              />
              Respect taper
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create anchor"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm(today));
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export { WEEKDAY_LABELS, WEEKDAYS };
