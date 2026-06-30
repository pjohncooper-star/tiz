"use client";

import { useEffect, useState } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { Button, Input, Label } from "@/components/ui";
import type { ApplyTemplateMode } from "@/components/calendar/types";

const WEEK_OPTS = { weekStartsOn: 1 as const };

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
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/calendar/template/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, mode }),
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
          <Button type="button" onClick={handleApply} disabled={saving}>
            {saving ? "Applying…" : "Apply template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
