"use client";

import { useEffect, useState } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { Button, Input, Label } from "@/components/ui";
import type { ApplyTemplateMode } from "@/components/calendar/types";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";
import type { WeeklyTemplateKind } from "@prisma/client";

const WEEK_OPTS = { weekStartsOn: 1 as const };

type TemplateOption = {
  id: string;
  name: string;
  category: WeeklyTemplateKind;
  itemCount: number;
};

type ApplyTemplateDialogProps = {
  defaultWeekStart: string;
  open: boolean;
  hasExistingSessions: boolean;
  onClose: () => void;
  onApplied: (appliedWeekStart: string) => void;
};

export function ApplyTemplateDialog({
  defaultWeekStart,
  open,
  hasExistingSessions,
  onClose,
  onApplied,
}: ApplyTemplateDialogProps) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekHasSessions, setWeekHasSessions] = useState(hasExistingSessions);
  const [mode, setMode] = useState<ApplyTemplateMode>(
    hasExistingSessions ? "clear_template_days" : "merge"
  );
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWeekStart(defaultWeekStart);
      setWeekHasSessions(hasExistingSessions);
      setMode(hasExistingSessions ? "clear_template_days" : "merge");
    }
  }, [open, defaultWeekStart, hasExistingSessions]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch("/api/plan/calendar/templates");
      if (res.ok) {
        const data = await res.json();
        const list = (data.templates ?? []).map(
          (t: { id: string; name: string; category: WeeklyTemplateKind; items: unknown[] }) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            itemCount: t.items.length,
          })
        ) as TemplateOption[];
        setTemplates(list);
        setTemplateId((current) => current || list[0]?.id || "");
      }
      setTemplatesLoaded(true);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await fetch(
        `/api/plan/calendar/template/apply?weekStart=${encodeURIComponent(weekStart)}`
      );
      const json = res.ok ? await res.json() : { hasSessions: false };
      const has = !!json.hasSessions;
      setWeekHasSessions(has);
      if (!has) setMode("merge");
    })();
  }, [open, weekStart]);

  if (!open) return null;

  async function handleApply() {
    if (!templateId) {
      setError("Select a template to apply");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/calendar/template/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, weekStart, mode }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg =
        typeof data.error === "string"
          ? data.error
          : data.error?.formErrors?.join?.(" ") ?? "Failed to apply template";
      setError(errMsg);
      return;
    }
    onApplied(weekStart);
    onClose();
  }

  const weekLabel = format(
    startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS),
    "MMM d, yyyy"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-900">
        <h3 className="text-lg font-semibold">Apply weekly template</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Add templated sessions to a week on your calendar.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label>Template</Label>
            {templatesLoaded && templates.length === 0 ? (
              <p className="mt-1 text-sm text-zinc-500">
                No templates yet. Create one in the template library first.
              </p>
            ) : (
              <select
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {!templateId ? <option value="">Select a template…</option> : null}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({templateCategoryLabel(t.category)}, {t.itemCount})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <Label>Week starting (Monday)</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => {
                const d = parseISO(`${e.target.value}T12:00:00`);
                setWeekStart(format(startOfWeek(d, WEEK_OPTS), "yyyy-MM-dd"));
              }}
            />
            <p className="mt-1 text-xs text-zinc-500">Week of {weekLabel}</p>
          </div>

          {weekHasSessions && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">This week already has sessions</legend>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-mode"
                  checked={mode === "clear_week"}
                  onChange={() => setMode("clear_week")}
                  className="mt-1"
                />
                <span>
                  <strong>Clear entire week</strong> — remove all sessions, then add template
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-mode"
                  checked={mode === "clear_template_days"}
                  onChange={() => setMode("clear_template_days")}
                  className="mt-1"
                />
                <span>
                  <strong>Clear template days only</strong> — remove previous template sessions on
                  days that have template slots, then add
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  className="mt-1"
                />
                <span>
                  <strong>Add to existing</strong> — keep all current sessions and add template
                  sessions
                </span>
              </label>
            </fieldset>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={saving || !templateId}>
            {saving ? "Applying…" : "Apply template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
