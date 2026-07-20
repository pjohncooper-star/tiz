"use client";

import { useState } from "react";
import type { WeeklyTemplateKind } from "@prisma/client";
import { Button } from "@/components/ui";
import { WeeklyTemplateEditor } from "@/components/calendar/weekly-template-editor";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  templateCategoryLabel,
} from "@/lib/plan/calendar/template-category";

export type WeeklyTemplateListItem = {
  id: string;
  name: string;
  category: WeeklyTemplateKind;
  itemCount: number;
};

type WeeklyTemplateManagerProps = {
  initialTemplates: WeeklyTemplateListItem[];
};

export function WeeklyTemplateManager({ initialTemplates }: WeeklyTemplateManagerProps) {
  const [templates, setTemplates] = useState<WeeklyTemplateListItem[]>(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<WeeklyTemplateKind>("DEFAULT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const name = newName.trim() || "New template";
    setBusy(true);
    setError(null);
    const res = await fetch("/api/plan/calendar/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category: newCategory }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not create template");
      return;
    }
    const { template } = await res.json();
    setTemplates((list) => [
      ...list,
      { id: template.id, name: template.name, category: template.category, itemCount: 0 },
    ]);
    setSelectedId(template.id);
    setCreating(false);
    setNewName("");
    setNewCategory("DEFAULT");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template? It will be unassigned from any phases or seasons.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/plan/calendar/templates/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not delete template");
      return;
    }
    setTemplates((list) => {
      const next = list.filter((t) => t.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function handleSaved(summary: { id: string; name: string; category: WeeklyTemplateKind }) {
    setTemplates((list) =>
      list.map((t) =>
        t.id === summary.id ? { ...t, name: summary.name, category: summary.category } : t
      )
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Templates</h2>
          <Button type="button" variant="secondary" onClick={() => setCreating((v) => !v)}>
            + New
          </Button>
        </div>

        {creating ? (
          <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <input
              autoFocus
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Template name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <select
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as WeeklyTemplateKind)}
            >
              {TEMPLATE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="button" onClick={handleCreate} disabled={busy}>
                Create
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {templates.length === 0 && !creating ? (
          <p className="text-sm text-zinc-500">
            No templates yet. Create one to reuse across phases and seasons.
          </p>
        ) : null}

        <ul className="space-y-1">
          {templates.map((template) => {
            const active = template.id === selectedId;
            return (
              <li key={template.id}>
                <div
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    active
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelectedId(template.id)}
                  >
                    <span className="block truncate font-medium">{template.name}</span>
                    <span className="text-xs text-zinc-500">
                      {templateCategoryLabel(template.category)} · {template.itemCount}{" "}
                      {template.itemCount === 1 ? "session" : "sessions"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red-600 hover:text-red-800"
                    onClick={() => handleDelete(template.id)}
                    disabled={busy}
                    aria-label={`Delete ${template.name}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </aside>

      <section className="min-w-0">
        {selectedId ? (
          <WeeklyTemplateEditor key={selectedId} templateId={selectedId} onSaved={handleSaved} />
        ) : (
          <p className="text-sm text-zinc-500">
            Select a template on the left, or create a new one to start editing.
          </p>
        )}
      </section>
    </div>
  );
}
