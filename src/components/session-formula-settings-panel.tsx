"use client";

import { useState } from "react";
import { NumberEditorInput } from "@/components/number-editor-input";
import { Button, Input, Label } from "@/components/ui";
import {
  createEmptyDisciplineFormula,
  formulaShareTotal,
  validateDisciplineFormula,
  type DisciplineFormula,
  type FormulaDiscipline,
  type FormulaSession,
  type FormulaZone,
  type SessionFormulaCatalog,
} from "@/lib/plan/season/base-formulas";

const DISCIPLINES: { id: FormulaDiscipline; label: string }[] = [
  { id: "SWIM", label: "Swim" },
  { id: "BIKE", label: "Bike" },
  { id: "RUN", label: "Run" },
];

const ZONES: FormulaZone[] = [1, 2, 3, 4, 5];

type SessionFormulaSettingsPanelProps = {
  initialCatalog: SessionFormulaCatalog;
};

async function persistCatalog(
  sessionFormulaCatalog: SessionFormulaCatalog
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "session-formula-settings", data: { sessionFormulaCatalog } }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? "Could not save session formulas" };
}

export function SessionFormulaSettingsPanel({ initialCatalog }: SessionFormulaSettingsPanelProps) {
  const [saved, setSaved] = useState(initialCatalog);
  const [draft, setDraft] = useState(initialCatalog);
  const [selectedId, setSelectedId] = useState<string | null>(initialCatalog[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const selected = draft.find((formula) => formula.id === selectedId) ?? null;

  function updateSelected(next: DisciplineFormula) {
    setDraft(draft.map((formula) => (formula.id === next.id ? next : formula)));
  }

  function updateSession(index: number, patch: Partial<FormulaSession>) {
    if (!selected) return;
    updateSelected({
      ...selected,
      sessions: selected.sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, ...patch } : session
      ),
    });
  }

  async function handleSave() {
    if (!dirty) return;
    const invalid = draft.map((formula) => validateDisciplineFormula(formula)).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
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
    setSelectedId(saved[0]?.id ?? null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        A formula belongs to one sport. A season phase can choose it for that sport. Shares are
        that session’s part of the week and must total 100%.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const created = createEmptyDisciplineFormula("RUN");
            setDraft([...draft, created]);
            setSelectedId(created.id);
            setError(null);
          }}
        >
          Add formula
        </Button>
      </div>
      {draft.length === 0 ? (
        <p className="text-sm text-zinc-500">No formulas yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
          <ul className="space-y-1">
            {draft.map((formula) => (
              <li key={formula.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1 text-left text-sm ${
                    formula.id === selectedId
                      ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  onClick={() => setSelectedId(formula.id)}
                >
                  {formula.name.trim() || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <FormulaEditor
              formula={selected}
              onChange={updateSelected}
              onSessionChange={updateSession}
              onDelete={() => {
                const next = draft.filter((formula) => formula.id !== selected.id);
                setDraft(next);
                setSelectedId(next[0]?.id ?? null);
              }}
            />
          ) : null}
        </div>
      )}
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

function FormulaEditor({
  formula,
  onChange,
  onSessionChange,
  onDelete,
}: {
  formula: DisciplineFormula;
  onChange: (formula: DisciplineFormula) => void;
  onSessionChange: (index: number, patch: Partial<FormulaSession>) => void;
  onDelete: () => void;
}) {
  const shareTotal = formulaShareTotal(formula.sessions);
  const shareOk = Math.abs(shareTotal - 100) <= 0.05;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input
            className="mt-1"
            value={formula.name}
            onChange={(event) => onChange({ ...formula, name: event.target.value })}
          />
        </div>
        <div>
          <Label>Sport</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={formula.discipline}
            onChange={(event) => {
              const discipline = event.target.value as FormulaDiscipline;
              onChange({
                ...formula,
                discipline,
                sessions: formula.sessions.map((session) => ({
                  ...session,
                  long: discipline === "SWIM" ? false : session.long,
                })),
              });
            }}
          >
            {DISCIPLINES.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Growth % per week</Label>
          <NumberEditorInput
            min={0}
            max={100}
            integer={false}
            className="mt-1"
            value={formula.growthPercentPerWeek}
            onCommit={(value) => {
              if (value == null) return;
              onChange({ ...formula, growthPercentPerWeek: value });
            }}
          />
        </div>
        <div>
          <Label>Peak cap (h)</Label>
          <NumberEditorInput
            nullable
            integer={false}
            min={0}
            className="mt-1"
            placeholder="No cap"
            value={formula.peakCapHours}
            onCommit={(peakCapHours) => onChange({ ...formula, peakCapHours })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Sessions</p>
          <Button
            type="button"
            variant="secondary"
            disabled={formula.sessions.length >= 7}
            onClick={() =>
              onChange({
                ...formula,
                sessions: [
                  ...formula.sessions,
                  { sharePercent: 0, zone: 1, intensity: false, long: false },
                ],
              })
            }
          >
            Add session
          </Button>
        </div>
        {formula.sessions.map((session, index) => (
          <div
            key={`${formula.id}-${index}`}
            className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-800"
          >
            <div>
              <Label>Share %</Label>
              <NumberEditorInput
                min={0}
                max={100}
                integer={false}
                className="mt-1"
                value={session.sharePercent}
                onCommit={(value) => {
                  if (value == null) return;
                  onSessionChange(index, { sharePercent: value });
                }}
              />
            </div>
            <div>
              <Label>Zone</Label>
              <select
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={session.zone}
                onChange={(event) =>
                  onSessionChange(index, { zone: Number(event.target.value) as FormulaZone })
                }
              >
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    Z{zone}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={session.intensity}
                onChange={(event) => onSessionChange(index, { intensity: event.target.checked })}
              />
              Intensity
            </label>
            {formula.discipline === "SWIM" ? null : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={session.long}
                  onChange={(event) => {
                    const long = event.target.checked;
                    onChange({
                      ...formula,
                      sessions: formula.sessions.map((row, rowIndex) => ({
                        ...row,
                        long: rowIndex === index ? long : long ? false : row.long,
                      })),
                    });
                  }}
                />
                Long
              </label>
            )}
            {formula.sessions.length > 1 ? (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    onChange({
                      ...formula,
                      sessions: formula.sessions.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                >
                  Remove session
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        <p className={`text-xs ${shareOk ? "text-zinc-500" : "text-amber-700 dark:text-amber-300"}`}>
          Shares total {shareTotal}%.
        </p>
      </div>

      <Button type="button" variant="secondary" onClick={onDelete}>
        Delete formula
      </Button>
    </div>
  );
}
