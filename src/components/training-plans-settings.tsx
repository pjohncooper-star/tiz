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

type PlanDetailSession = {
  id: string;
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  title: string;
  sessionRole: string;
  estimatedDurationMinutes: number | null;
  hasStructuredWorkout: boolean;
  relativePaceLabels: string[];
};

type PlanDetail = PlanListItem & {
  sessions: PlanDetailSession[];
  requiredPaceAnchors: { ref: string; refSource: string; label: string }[];
  appliedFutureSessionCount: number;
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
  const [browsePlanId, setBrowsePlanId] = useState<string | null>(null);

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
        `Delete training plan “${plan.name}”? Applied calendar sessions stay on the calendar (untagged from the plan).`
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

  async function handleClearFuture(plan: PlanListItem) {
    if (
      !window.confirm(
        `Remove future calendar sessions applied from “${plan.name}” (today onward)? Past sessions stay.`
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/plan/training-plans/${plan.id}?clearFuture=1`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Clear failed");
      return;
    }
    const removed = typeof data.removed === "number" ? data.removed : 0;
    window.alert(
      removed === 0
        ? "No future sessions from this plan to remove."
        : `Removed ${removed} future session${removed === 1 ? "" : "s"}.`
    );
    void reload();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Reusable session packs saved from CSV. Apply onto the calendar by choosing a start
        or end date. Relative pace targets stay live until a session is linked to an
        activity (then absolute paces are frozen for history).
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setBrowsePlanId(plan.id)}
              >
                Browse
              </Button>
              <Button type="button" variant="secondary" onClick={() => setApplyPlan(plan)}>
                Apply
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleClearFuture(plan)}
              >
                Clear future
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
      {browsePlanId ? (
        <BrowseTrainingPlanDialog
          planId={browsePlanId}
          onClose={() => setBrowsePlanId(null)}
          onChanged={() => void reload()}
          onApply={(plan) => {
            setBrowsePlanId(null);
            setApplyPlan(plan);
          }}
        />
      ) : null}
    </div>
  );
}

function BrowseTrainingPlanDialog({
  planId,
  onClose,
  onChanged,
  onApply,
}: {
  planId: string;
  onClose: () => void;
  onChanged: () => void;
  onApply: (plan: PlanListItem) => void;
}) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/plan/training-plans/${planId}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load plan");
        return;
      }
      const plan = data.plan as PlanDetail;
      setDetail(plan);
      setNameDraft(plan.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  async function handleRename() {
    if (!detail || nameDraft.trim() === detail.name) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/training-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Rename failed");
      return;
    }
    setDetail((d) => (d ? { ...d, name: data.plan.name as string } : d));
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-lg dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold">Plan sessions</h3>
          {detail ? (
            <p className="mt-1 text-sm text-zinc-500">
              {detail.sessionCount} sessions · {detail.durationDays} days ·{" "}
              {detail.appliedFutureSessionCount} future on calendar
            </p>
          ) : null}
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {!detail && !error ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : null}
          {detail ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <Label>Name</Label>
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename();
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving || nameDraft.trim() === detail.name}
                  onClick={() => void handleRename()}
                >
                  Rename
                </Button>
              </div>
              {detail.requiredPaceAnchors.length > 0 ? (
                <p className="text-xs text-zinc-500">
                  Uses relative paces:{" "}
                  {detail.requiredPaceAnchors.map((a) => a.label).join(", ")}
                </p>
              ) : null}
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {detail.sessions.map((s) => (
                  <li key={s.id} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        Day {s.dayOffset + 1} · {s.discipline} · {s.title}
                      </span>
                      {s.estimatedDurationMinutes != null ? (
                        <span className="text-xs text-zinc-500">
                          {s.estimatedDurationMinutes} min
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {s.hasStructuredWorkout ? "Structured" : "Skeleton"}
                      {s.relativePaceLabels.length > 0
                        ? ` · ${s.relativePaceLabels.join(", ")}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {detail ? (
            <Button
              type="button"
              onClick={() =>
                onApply({
                  id: detail.id,
                  name: detail.name,
                  description: detail.description,
                  durationDays: detail.durationDays,
                  sessionCount: detail.sessionCount,
                  anchorWeekday: detail.anchorWeekday,
                })
              }
            >
              Apply…
            </Button>
          ) : null}
        </div>
      </div>
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
              {preview.requiredPaceAnchors && preview.requiredPaceAnchors.length > 0 ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Relative paces used:{" "}
                  {preview.requiredPaceAnchors.map((a) => a.label).join(", ")}
                </p>
              ) : null}
              {preview.missingAnchors && preview.missingAnchors.length > 0 ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">Set these before the plan resolves correctly:</p>
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

        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
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
