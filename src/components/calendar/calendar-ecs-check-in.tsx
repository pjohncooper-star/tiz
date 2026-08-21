"use client";

import { useState } from "react";
import {
  ECS_VALUES,
  ecsLabel,
  formatEcsDisplay,
  type DailyEcsPoint,
} from "@/lib/eco/ecs";

export type CalendarEcsCheckIn = DailyEcsPoint & {
  note?: string | null;
};

type CalendarEcsCheckInCardProps = {
  dateKey: string;
  checkIn: CalendarEcsCheckIn | null;
  onChanged: (next: CalendarEcsCheckIn | null) => void;
};

async function upsertEcs(
  dateKey: string,
  ecs: number
): Promise<CalendarEcsCheckIn> {
  const res = await fetch("/api/eco/ecs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateKey, ecs }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not save ECS");
  }
  const data = (await res.json()) as { checkIn: CalendarEcsCheckIn };
  return data.checkIn;
}

async function clearEcs(dateKey: string): Promise<void> {
  const res = await fetch(`/api/eco/ecs?date=${encodeURIComponent(dateKey)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not clear ECS");
  }
}

export function CalendarEcsCheckInCard({
  dateKey,
  checkIn,
  onChanged,
}: CalendarEcsCheckInCardProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(checkIn?.ecs ?? null);

  function openEditor() {
    setDraft(checkIn?.ecs ?? null);
    setError(null);
    setOpen(true);
  }

  async function save(value: number) {
    setSaving(true);
    setError(null);
    try {
      const next = await upsertEcs(dateKey, value);
      onChanged(next);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save ECS");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await clearEcs(dateKey);
      onChanged(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear ECS");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition ${
          checkIn
            ? "border-amber-300/80 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            : "border-dashed border-zinc-300 text-zinc-500 hover:border-amber-400 hover:text-amber-800 dark:border-zinc-700 dark:hover:border-amber-700 dark:hover:text-amber-200"
        }`}
        aria-label={
          checkIn
            ? `Edit ECS for ${dateKey}: ${formatEcsDisplay(checkIn.ecs)}`
            : `Log end-of-day ECS for ${dateKey}`
        }
      >
        {checkIn ? (
          <span>
            <span className="font-medium">ECS</span> {formatEcsDisplay(checkIn.ecs)}
          </span>
        ) : (
          <span>Log ECS</span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-amber-300/80 bg-amber-50/90 p-2 dark:border-amber-800 dark:bg-amber-950/50">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-amber-900/80 dark:text-amber-200/80">
          End-of-day ECS
        </p>
        <button
          type="button"
          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Close
        </button>
      </div>
      <p className="mb-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        Daily subjective load (0–5), not session RPE.
      </p>
      <div className="flex flex-wrap gap-1">
        {ECS_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={saving}
            onClick={() => {
              setDraft(value);
              void save(value);
            }}
            title={ecsLabel(value)}
            className={`min-w-8 rounded border px-1.5 py-1 text-xs tabular-nums ${
              draft === value
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      {checkIn ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void remove()}
          className="mt-2 text-[11px] text-zinc-500 underline hover:text-red-600"
        >
          Clear
        </button>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
