"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { trainingPlanHref } from "@/lib/plan/library-href";

type CreateTrainingPlanFromCalendarDialogProps = {
  initialStartDate?: string;
  initialEndDate?: string;
  onClose: () => void;
  onCreated?: (planId: string) => void;
};

export function CreateTrainingPlanFromCalendarDialog({
  initialStartDate,
  initialEndDate,
  onClose,
  onCreated,
}: CreateTrainingPlanFromCalendarDialogProps) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(initialStartDate ?? today);
  const [endDate, setEndDate] = useState(initialEndDate ?? today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmGaps, setConfirmGaps] = useState(false);

  async function handleCreate(forceConfirmGaps = false) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Plan name is required");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/training-plans/from-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        startDate,
        endDate,
        confirmLargeGaps: forceConfirmGaps || confirmGaps,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      if (data.code === "GAP_WARNING") {
        setConfirmGaps(true);
        setError(
          typeof data.error === "string"
            ? `${data.error} Click Create again to confirm.`
            : "Large gap — confirm to continue."
        );
        return;
      }
      setError(typeof data.error === "string" ? data.error : "Could not create plan");
      return;
    }
    const planId = data.plan?.id as string | undefined;
    if (planId) {
      onCreated?.(planId);
      router.push(trainingPlanHref(planId));
      router.refresh();
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-900">
        <h3 className="text-lg font-semibold">Create plan from calendar</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Copies sessions and workouts as stored (relative targets stay relative; frozen
          absolutes stay absolute). Calendar edits will not sync back automatically.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Plan name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spring base block"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate(confirmGaps)}
          >
            {saving ? "Creating…" : confirmGaps ? "Create anyway" : "Create plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
