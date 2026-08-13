"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApplyTrainingPlanDialog,
  type ApplyTrainingPlanListItem,
} from "@/components/apply-training-plan-dialog";
import { CalendarCsvImportSettings } from "@/components/calendar-csv-import-settings";
import { CreateTrainingPlanFromCalendarDialog } from "@/components/create-training-plan-from-calendar-dialog";
import { Button } from "@/components/ui";
import { trainingPlanHref } from "@/lib/plan/library-href";

type PlanListItem = ApplyTrainingPlanListItem;

function weeksLabel(days: number): string {
  const weeks = Math.round((days / 7) * 10) / 10;
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}

export function TrainingPlansLibraryView() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyPlan, setApplyPlan] = useState<PlanListItem | null>(null);
  const [createFromCalendarOpen, setCreateFromCalendarOpen] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);

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
  }, [reload, libraryKey]);

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
    const res = await fetch(`/api/plan/training-plans/${plan.id}?clearFuture=1`, {
      method: "DELETE",
    });
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
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Import CSV
          </h2>
          <Button type="button" onClick={() => setCreateFromCalendarOpen(true)}>
            Create from calendar…
          </Button>
        </div>
        <CalendarCsvImportSettings onPlanSaved={() => setLibraryKey((k) => k + 1)} />
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Saved plans
        </h2>
        <p className="text-sm text-zinc-500">
          Edit library packs here. Applying copies sessions onto the calendar; calendar edits do
          not rewrite the library unless you create a new plan from a date range.
        </p>
        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {!loading && plans.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No training plans yet. Import a CSV or create one from the calendar.
          </p>
        ) : null}
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <Link
                  href={trainingPlanHref(plan.id)}
                  className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                >
                  {plan.name}
                </Link>
                <p className="text-xs text-zinc-500">
                  {plan.sessionCount} sessions · {plan.durationDays} days (
                  {weeksLabel(plan.durationDays)}) · starts {plan.anchorWeekday}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={trainingPlanHref(plan.id)}>
                  <Button type="button" variant="secondary">
                    Edit
                  </Button>
                </Link>
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
      </section>

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
      {createFromCalendarOpen ? (
        <CreateTrainingPlanFromCalendarDialog
          onClose={() => setCreateFromCalendarOpen(false)}
          onCreated={() => setCreateFromCalendarOpen(false)}
        />
      ) : null}
    </div>
  );
}
