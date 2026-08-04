"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, Input, Label, Select } from "@/components/ui";
import type { Discipline } from "@prisma/client";

export type ShiftWeekMode = "week" | "discipline";

type ShiftPreview = {
  deltaDays: number;
  moveCount: number;
  deleteCount: number;
  wallSeasonName: string | null;
  wallDateKey: string | null;
};

type ShiftWeekDialogProps = {
  open: boolean;
  weekStart: string;
  mode: ShiftWeekMode;
  disciplinesInWeek: Discipline[];
  onClose: () => void;
  onShifted: () => void;
};

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  BIKE: "Bike",
  RUN: "Run",
  SWIM: "Swim",
  STRENGTH: "Strength",
};

export function ShiftWeekDialog({
  open,
  weekStart,
  mode,
  disciplinesInWeek,
  onClose,
  onShifted,
}: ShiftWeekDialogProps) {
  const [targetDate, setTargetDate] = useState(weekStart);
  const [discipline, setDiscipline] = useState<Discipline | "">(
    disciplinesInWeek[0] ?? ""
  );
  const [preview, setPreview] = useState<ShiftPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetDate(weekStart);
    setDiscipline(disciplinesInWeek[0] ?? "");
    setPreview(null);
    setError(null);
    setConfirming(false);
  }, [open, weekStart, disciplinesInWeek]);

  const title =
    mode === "discipline" ? "Shift discipline forward" : "Shift calendar forward";

  const weekLabel = format(parseISO(`${weekStart}T12:00:00`), "MMM d, yyyy");

  async function loadPreview() {
    if (mode === "discipline" && !discipline) {
      setError("Choose a discipline");
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/plan/calendar/week/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          targetDate,
          discipline: mode === "discipline" ? discipline : null,
          confirm: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not preview shift");
        return;
      }
      setPreview(data.preview as ShiftPreview);
      setConfirming(true);
    } finally {
      setLoading(false);
    }
  }

  async function confirmShift() {
    if (mode === "discipline" && !discipline) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/calendar/week/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          targetDate,
          discipline: mode === "discipline" ? discipline : null,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Shift failed");
        return;
      }
      onShifted();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-week-title"
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
      >
        <h3 id="shift-week-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          From the week of {weekLabel} forward. Races stay put. Pick the new date for that
          Monday — any weekday is allowed.
        </p>

        <div className="mt-4 space-y-3">
          {mode === "discipline" ? (
            <div>
              <Label>Discipline</Label>
              <Select
                value={discipline}
                onChange={(e) => {
                  setDiscipline(e.target.value as Discipline);
                  setConfirming(false);
                  setPreview(null);
                }}
              >
                {disciplinesInWeek.map((d) => (
                  <option key={d} value={d}>
                    {DISCIPLINE_LABEL[d]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <Label>New date for week of {weekLabel}</Label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => {
                setTargetDate(e.target.value);
                setConfirming(false);
                setPreview(null);
              }}
            />
          </div>

          {preview ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p>
                Shift by {preview.deltaDays > 0 ? "+" : ""}
                {preview.deltaDays} day{Math.abs(preview.deltaDays) === 1 ? "" : "s"}: move{" "}
                {preview.moveCount} session{preview.moveCount === 1 ? "" : "s"}
                {preview.deleteCount > 0
                  ? `, delete ${preview.deleteCount} session${preview.deleteCount === 1 ? "" : "s"}`
                  : ""}
                .
              </p>
              {preview.deleteCount > 0 && preview.wallSeasonName && preview.wallDateKey ? (
                <p className="mt-1">
                  {preview.deleteCount} session{preview.deleteCount === 1 ? "" : "s"} would land
                  in “{preview.wallSeasonName}” (starts {preview.wallDateKey}) and will be
                  deleted. Linked activities are unlinked, not removed.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {!confirming ? (
            <Button type="button" onClick={() => void loadPreview()} disabled={loading || !targetDate}>
              {loading ? "Checking…" : "Review shift"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void confirmShift()}
              disabled={loading || (preview != null && preview.moveCount === 0 && preview.deleteCount === 0)}
            >
              {loading ? "Shifting…" : "Confirm shift"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
