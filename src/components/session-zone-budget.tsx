"use client";

import { useEffect, useState } from "react";
import type { Discipline } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import {
  rollupTreeToZoneMinutes,
  type WorkoutTreeDocument,
} from "@/lib/workout/steps";

const ZONES = [1, 2, 3, 4, 5] as const;

type WeekTargetResponse = {
  weekTarget: CalendarWeekTarget | null;
  plannedZoneMinutes: Record<string, number>;
};

type SessionZoneBudgetProps = {
  sessionId: string;
  scheduledDate: string;
  discipline: Discipline;
  workoutTree: WorkoutTreeDocument | null;
};

export function SessionZoneBudget({
  sessionId,
  scheduledDate,
  discipline,
  workoutTree,
}: SessionZoneBudgetProps) {
  const [data, setData] = useState<WeekTargetResponse | null>(null);

  useEffect(() => {
    if (discipline === "STRENGTH") {
      setData(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ date: scheduledDate, excludeSessionId: sessionId });
    fetch(`/api/plan/calendar/week-target?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: WeekTargetResponse | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, scheduledDate, discipline]);

  if (!data?.weekTarget || discipline === "STRENGTH") return null;

  const disciplineTarget = data.weekTarget.byDiscipline.find(
    (d) => d.discipline === discipline
  );
  if (!disciplineTarget) return null;

  const liveRollup = workoutTree ? rollupTreeToZoneMinutes(workoutTree) : {};

  const rows = ZONES.map((zone) => {
    const key = `${discipline}-${zone}`;
    const target = disciplineTarget.zoneMinutes[key] ?? 0;
    const plannedOther = data.plannedZoneMinutes[key] ?? 0;
    const live = liveRollup[String(zone)] ?? 0;
    const remaining = Math.round((target - plannedOther - live) * 10) / 10;
    return { zone, target, remaining };
  }).filter((row) => row.target > 0 || row.remaining !== 0);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50/70 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold text-zinc-600 dark:text-zinc-300">
          Weekly zone budget left
        </span>
        {data.weekTarget.phase ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: data.weekTarget.phase.color }}
              aria-hidden
            />
            {data.weekTarget.phase.name}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">
        Target minus other planned sessions this week and the workout being built.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((row) => {
          const over = row.remaining < 0;
          return (
            <span
              key={row.zone}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums ${
                over
                  ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200"
                  : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              <span className="font-semibold">Z{row.zone}</span>
              {over ? `${Math.abs(row.remaining)} over` : `${row.remaining} min`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
