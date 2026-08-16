"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, SegmentedControl } from "@/components/ui";

export type ApplyTrainingPlanListItem = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  sessionCount: number;
  anchorWeekday: string;
};

type ApplyPreviewSession = {
  dayOffset: number;
  scheduledDate: string;
  discipline: string;
  title: string;
  hasStructuredWorkout: boolean;
  relativePaceLabels: string[];
};

type ApplyPreview = {
  startDate: string;
  endDate: string;
  truncated: boolean;
  truncateOffset: number;
  appliedDurationDays: number;
  sessionCount: number;
  hasExistingPlanSessions: boolean;
  existingPlanSessionCount: number;
  sessions?: ApplyPreviewSession[];
  requiredPaceAnchors?: { ref: string; refSource: string; label: string }[];
  missingAnchors?: string[];
};

export function ApplyTrainingPlanDialog({
  plan,
  onClose,
  onApplied,
}: {
  plan: ApplyTrainingPlanListItem;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [anchorMode, setAnchorMode] = useState<"start" | "end">("start");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPreviewError(null);
      const res = await fetch(
        `/api/plan/training-plans/${plan.id}/apply?anchorMode=${anchorMode}&date=${encodeURIComponent(date)}`
      );
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setPreview(null);
        setPreviewError(
          typeof data.error === "string" ? data.error : "Could not preview window"
        );
        return;
      }
      setPreview(data.preview as ApplyPreview);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan.id, anchorMode, date]);

  useEffect(() => {
    if (preview?.hasExistingPlanSessions) {
      setMode("replace");
    } else {
      setMode("merge");
    }
  }, [preview?.hasExistingPlanSessions, preview?.startDate, preview?.endDate]);

  async function handleApply() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/training-plans/${plan.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchorMode, date, mode }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Apply failed");
      return;
    }
    onApplied();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-lg dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold">Apply “{plan.name}”</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {plan.sessionCount} sessions over {plan.durationDays} days. Enter a start or end
            date; the other end of the window is filled in.
          </p>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <SegmentedControl
            value={anchorMode}
            onChange={setAnchorMode}
            options={[
              { value: "start", label: "Start date" },
              { value: "end", label: "End date" },
            ]}
          />
          <div>
            <Label>{anchorMode === "start" ? "Start date" : "End date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {previewError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{previewError}</p>
          ) : null}

          {preview ? (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950/50">
              <p>
                Window: <strong>{preview.startDate}</strong> →{" "}
                <strong>{preview.endDate}</strong> ({preview.sessionCount} sessions,{" "}
                {preview.appliedDurationDays} days)
              </p>
              {preview.truncated ? (
                <p className="text-amber-800 dark:text-amber-200">
                  Truncated from the start to fit before the end date (skipped first{" "}
                  {preview.truncateOffset} program day
                  {preview.truncateOffset === 1 ? "" : "s"}). Later sessions are kept.
                </p>
              ) : null}
              {preview.hasExistingPlanSessions ? (
                <p className="text-amber-800 dark:text-amber-200">
                  This program already has {preview.existingPlanSessionCount} session
                  {preview.existingPlanSessionCount === 1 ? "" : "s"} in this range.
                </p>
              ) : null}
              {preview.requiredPaceAnchors && preview.requiredPaceAnchors.length > 0 ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Relative paces used:{" "}
                  {preview.requiredPaceAnchors.map((a) => a.label).join(", ")}
                </p>
              ) : null}
              {preview.missingAnchors && preview.missingAnchors.length > 0 ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">Set these before the program resolves correctly:</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {preview.missingAnchors.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">
                    You can still apply — targets stay relative and update when anchors are set.
                  </p>
                </div>
              ) : null}
              {preview.sessions && preview.sessions.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Sessions in window
                    {preview.sessionCount > preview.sessions.length
                      ? ` (showing first ${preview.sessions.length})`
                      : ""}
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {preview.sessions.map((s) => (
                      <li key={`${s.scheduledDate}-${s.title}-${s.dayOffset}`}>
                        <span className="tabular-nums">{s.scheduledDate}</span> · {s.discipline}{" "}
                        · {s.title}
                        {s.relativePaceLabels.length > 0
                          ? ` (${s.relativePaceLabels.join(", ")})`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {preview?.hasExistingPlanSessions ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Existing program sessions in range</legend>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="plan-apply-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  className="mt-1"
                />
                <span>
                  <strong>Merge</strong> — keep existing sessions and add another copy
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="plan-apply-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-1"
                />
                <span>
                  <strong>Replace this program’s sessions in range</strong> — remove prior
                  sessions from this program in the window, then apply
                </span>
              </label>
            </fieldset>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleApply()}
            disabled={saving || !preview || Boolean(previewError)}
          >
            {saving ? "Applying…" : "Apply program"}
          </Button>
        </div>
      </div>
    </div>
  );
}
