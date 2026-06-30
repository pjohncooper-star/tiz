"use client";

import { useState } from "react";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  type DisciplineUnitSettings,
  type PoolSize,
  POOL_SIZE_OPTIONS,
  poolSizeForSwimStep,
} from "@/lib/units/discipline-settings";
import { Button, Label, Select } from "@/components/ui";

const DISCIPLINES: PlanDiscipline[] = ["BIKE", "RUN", "SWIM"];

const SPORT_LABELS: Record<PlanDiscipline, string> = {
  BIKE: "Bike",
  RUN: "Run",
  SWIM: "Swim",
};

const UNIT_HINTS: Record<PlanDiscipline, string> = {
  BIKE: "Speed and distance in the planner and on session cards.",
  RUN: "Pace and distance in the planner and on session cards.",
  SWIM: "Pace and distance for session totals and reporting (not workout step cards).",
};

type DisciplineUnitsSettingsProps = {
  initialSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
};

function settingsEqual(a: DisciplineUnitSettings, b: DisciplineUnitSettings): boolean {
  return a.displayUnit === b.displayUnit && a.poolSize === b.poolSize;
}

function changedDisciplines(
  draft: Record<PlanDiscipline, DisciplineUnitSettings>,
  saved: Record<PlanDiscipline, DisciplineUnitSettings>
): PlanDiscipline[] {
  return DISCIPLINES.filter((d) => !settingsEqual(draft[d], saved[d]));
}

async function persistDisciplineUnits(
  discipline: PlanDiscipline,
  patch: { displayUnit?: DisplayUnit; poolSize?: PoolSize | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "discipline-units", data: { discipline, ...patch } }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save unit settings" };
}

export function DisciplineUnitsSettings({ initialSettings }: DisciplineUnitsSettingsProps) {
  const [saved, setSaved] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = changedDisciplines(draft, saved).length > 0;

  function patchDraft(
    discipline: PlanDiscipline,
    patch: Partial<DisciplineUnitSettings>
  ) {
    setDraft((prev) => ({
      ...prev,
      [discipline]: { ...prev[discipline], ...patch },
    }));
    setError(null);
  }

  async function handleSave() {
    const toSave = changedDisciplines(draft, saved);
    if (toSave.length === 0) return;

    setSaving(true);
    setError(null);

    for (const discipline of toSave) {
      const next = draft[discipline];
      const prev = saved[discipline];
      const patch: { displayUnit?: DisplayUnit; poolSize?: PoolSize | null } = {};
      if (next.displayUnit !== prev.displayUnit) patch.displayUnit = next.displayUnit;
      if (discipline === "SWIM" && next.poolSize !== prev.poolSize) {
        patch.poolSize = next.poolSize;
      }

      const result = await persistDisciplineUnits(discipline, patch);
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
        Default units for each sport. Used across the workout planner, session editor, and weekly
        plan cards.
      </p>
      {DISCIPLINES.map((discipline) => {
        const current = draft[discipline];
        const poolSize = poolSizeForSwimStep(current.poolSize);

        return (
          <div
            key={discipline}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {SPORT_LABELS[discipline]}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Units</Label>
                <Select
                  value={current.displayUnit}
                  onChange={(e) =>
                    patchDraft(discipline, { displayUnit: e.target.value as DisplayUnit })
                  }
                  disabled={saving}
                >
                  <option value="METRIC">Metric</option>
                  <option value="IMPERIAL">Imperial</option>
                </Select>
                <p className="mt-1 text-xs text-zinc-500">{UNIT_HINTS[discipline]}</p>
              </div>
              {discipline === "SWIM" && (
                <div>
                  <Label>Default pool size</Label>
                  <Select
                    value={poolSize}
                    onChange={(e) =>
                      patchDraft(discipline, { poolSize: e.target.value as PoolSize })
                    }
                    disabled={saving}
                  >
                    {POOL_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Drives distance and pace units on swim workout step cards.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save units"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
