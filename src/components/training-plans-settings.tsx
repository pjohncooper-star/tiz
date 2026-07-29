"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, SegmentedControl } from "@/components/ui";

type PlanListItem = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  sessionCount: number;
  anchorWeekday: string;
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
};

function weeksLabel(days: number): string {
  const weeks = Math.round((days / 7) * 10) / 10;
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

type TrainingPlansLibrarySettingsProps = {
  refreshKey?: number;
};

export function TrainingPlansLibrarySettings({
  refreshKey = 0,
}: TrainingPlansLibrarySettingsProps) {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyPlan, setApplyPlan] = useState<PlanListItem | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/training-plans");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load plans");
        setPlans([]);
        return;
      }
      setPlans(Array.isArray(data.plans) ? data.plans : []);
    } catch {
      setError("Failed to load plans");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  async function handleDelete(plan: PlanListItem) {
    if (
      !window.confirm(
        `Delete training plan “${plan.name}”? Applied calendar sessions stay.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/plan/training-plans/${plan.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Delete failed");
      return;
    }
    void reload();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Reusable session packs saved from CSV. Apply onto the calendar by choosing a start
        or end date. Applied sessions are normal editable calendar sessions tagged to the
        plan.
      </p>
      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {!loading && plans.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No training plans yet. Save one from CSV above.
        </p>
      ) : null}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {plan.name}
              </p>
              <p className="text-xs text-zinc-500">
                {plan.sessionCount} sessions · {plan.durationDays} days (
                {weeksLabel(plan.durationDays)}) · starts {plan.anchorWeekday}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setApplyPlan(plan)}>
                Apply
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleDelete(plan)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {applyPlan ? (
        <ApplyTrainingPlanDialog
          plan={applyPlan}
          onClose={() => setApplyPlan(null)}
          onApplied={() => {
            setApplyPlan(null);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ApplyTrainingPlanDialog({
  plan,
  onClose,
  onApplied,
}: {
  plan: PlanListItem;
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
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-900">
        <h3 className="text-lg font-semibold">Apply “{plan.name}”</h3>
        <p className="mt-1 text-sm text-zinc-500">
          {plan.sessionCount} sessions over {plan.durationDays} days. Enter a start or end
          date; the other end of the window is filled in.
        </p>

        <div className="mt-4 space-y-3">
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
                  {preview.truncateOffset} plan day
                  {preview.truncateOffset === 1 ? "" : "s"}). Later sessions are kept.
                </p>
              ) : null}
              {preview.hasExistingPlanSessions ? (
                <p className="text-amber-800 dark:text-amber-200">
                  This plan already has {preview.existingPlanSessionCount} session
                  {preview.existingPlanSessionCount === 1 ? "" : "s"} in this range.
                </p>
              ) : null}
            </div>
          ) : null}

          {preview?.hasExistingPlanSessions ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Existing plan sessions in range</legend>
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
                  <strong>Replace this plan’s sessions in range</strong> — remove prior
                  sessions from this plan in the window, then apply
                </span>
              </label>
            </fieldset>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleApply()}
            disabled={saving || !preview || Boolean(previewError)}
          >
            {saving ? "Applying…" : "Apply plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
