"use client";

import { Fragment } from "react";
import type { Discipline } from "@prisma/client";
import { Card } from "@/components/ui";
import {
  buildStepExecutionRows,
  formatDeltaSeconds,
  type StepExecutionRow,
} from "@/lib/plan/workout-execution";
import { formatDurationSeconds } from "@/lib/workout/workout-tree";
import type { WorkoutExecutionLap } from "@/lib/zones/compute";

type WorkoutStepExecutionProps = {
  plannedSteps: unknown;
  workoutLaps: WorkoutExecutionLap[] | undefined;
  discipline: Discipline;
};

function deltaTone(delta: number | null): string {
  if (delta == null) return "text-zinc-500";
  if (Math.abs(delta) <= 5) return "text-emerald-600 dark:text-emerald-400";
  if (Math.abs(delta) <= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ExecutionTable({ rows }: { rows: StepExecutionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-700">
            <th className="py-2 pr-3 font-medium">Step</th>
            <th className="py-2 pr-3 font-medium">Planned</th>
            <th className="py-2 pr-3 font-medium">Actual</th>
            <th className="py-2 font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const showGroup =
              row.groupLabel &&
              (i === 0 || rows[i - 1].groupLabel !== row.groupLabel);
            return (
              <Fragment key={row.index}>
                {showGroup && (
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <td
                      colSpan={4}
                      className="py-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                    >
                      {row.groupLabel}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-3">
                    {row.label}
                    {row.openDuration && (
                      <span className="ml-1 text-xs text-zinc-400">(open)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.plannedSeconds != null && row.plannedSeconds > 0
                      ? formatDurationSeconds(row.plannedSeconds)
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.actualSeconds != null
                      ? formatDurationSeconds(row.actualSeconds)
                      : "—"}
                  </td>
                  <td className={`py-2 tabular-nums ${deltaTone(row.deltaSeconds)}`}>
                    {formatDeltaSeconds(row.deltaSeconds)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WorkoutStepExecution({
  plannedSteps,
  workoutLaps,
  discipline,
}: WorkoutStepExecutionProps) {
  const rows = buildStepExecutionRows(plannedSteps, workoutLaps, discipline);
  if (!rows || rows.length === 0) return null;

  const hasActuals = rows.some((r) => r.actualSeconds != null);

  return (
    <Card title="Step execution">
      <p className="mb-3 text-xs text-zinc-500">
        Planned steps vs device laps (Garmin wktStepIndex or manual laps).
        {!hasActuals && workoutLaps?.length
          ? " Lap data is present but could not be matched — try re-importing the FIT file."
          : null}
      </p>
      <ExecutionTable rows={rows} />
    </Card>
  );
}
