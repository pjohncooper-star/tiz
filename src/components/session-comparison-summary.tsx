"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Discipline } from "@prisma/client";
import { ComparisonMetricsEditor } from "@/components/comparison-metrics-editor";
import { PlanTizChart } from "@/components/plan-tiz-chart";
import {
  disciplineZoneMinutesFromPills,
  fitZoneMinuteValuesToDuration,
  ZoneMinutePills,
  type ZoneMinuteValues,
} from "@/components/zone-minute-pills";
import { Button } from "@/components/ui";
import { zoneDurationBudgetMinutes } from "@/lib/plan/session-completion";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import {
  buildPlannedSessionStats,
  completedComparisonDuration,
  disciplineZoneMinutes,
  extraCompletedSummaryStats,
} from "@/lib/plan/session-stats";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import type { DisplayUnit, SessionMetrics } from "@/lib/workout/metrics";
import { paceInputLabel, reportingDistanceInputLabel, speedInputLabel } from "@/lib/workout/metrics";
import type { PoolSize } from "@/lib/units/discipline-settings";
import type { WorkoutStep } from "@/lib/workout/steps";

export type SessionComparisonSummaryProps = {
  discipline: PlanDiscipline;
  displayUnit: DisplayUnit;
  steps?: WorkoutStep[];
  sessionMetrics: SessionMetrics;
  completed: CompletedSessionSnapshot;
  structuredSteps?: unknown;
  targetZones?: unknown;
  durationHintMinutes?: number | null;
  thresholdPaceSeconds?: number | null;
  editable?: boolean;
  poolSize?: PoolSize | null;
  plannedTriad?: PlannedMetricsTriadValues;
  completedTriad?: PlannedMetricsTriadValues;
  onPlannedTriadChange?: (values: PlannedMetricsTriadValues) => void;
  onCompletedTriadChange?: (values: PlannedMetricsTriadValues) => void;
  completedZoneMinutes?: ZoneMinuteValues;
  onCompletedZoneMinutesChange?: (zone: import("@/components/zone-minute-pills").ZoneNumber, value: string) => void;
  plannedZoneMinutes?: ZoneMinuteValues;
  onPlannedZoneMinutesChange?: (zone: import("@/components/zone-minute-pills").ZoneNumber, value: string) => void;
  plannedZoneBudgetMinutes?: number | null;
  hidePlannedZonePills?: boolean;
  structuredWorkoutWarning?: string | null;
  linkedActivityId?: string | null;
  hasCompletedOverride?: boolean;
  onResetCompletedToActivity?: () => void;
  showSessionEditLink?: boolean;
  plannedSessionId?: string | null;
  plannedSessionReturnTo?: string;
};

function completedStat(
  stats: CompletedSessionSnapshot["stats"],
  label: string
): string | null {
  return stats.find((s) => s.label === label)?.value ?? null;
}

function ComparisonValue({ value }: { value: string | null }) {
  return (
    <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
      {value ?? "—"}
    </span>
  );
}

function StatRow({
  label,
  planned,
  completed,
}: {
  label: string;
  planned: string | null;
  completed: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6">
      <div>
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-0.5">
          <ComparisonValue value={planned} />
        </dd>
      </div>
      <div>
        <dt className="sr-only">{label} (completed)</dt>
        <dd className="mt-0.5">
          <ComparisonValue value={completed} />
        </dd>
      </div>
    </div>
  );
}

export function SessionComparisonSummary({
  discipline,
  displayUnit,
  steps = [],
  sessionMetrics,
  completed,
  structuredSteps,
  targetZones,
  durationHintMinutes,
  thresholdPaceSeconds,
  editable = false,
  poolSize = null,
  plannedTriad,
  completedTriad,
  onPlannedTriadChange,
  onCompletedTriadChange,
  completedZoneMinutes,
  onCompletedZoneMinutesChange,
  plannedZoneMinutes,
  onPlannedZoneMinutesChange,
  plannedZoneBudgetMinutes = null,
  hidePlannedZonePills = false,
  structuredWorkoutWarning = null,
  linkedActivityId = null,
  hasCompletedOverride = false,
  onResetCompletedToActivity,
  showSessionEditLink = false,
  plannedSessionId,
  plannedSessionReturnTo,
}: SessionComparisonSummaryProps) {
  const planned = useMemo(
    () =>
      buildPlannedSessionStats(discipline, displayUnit, sessionMetrics, {
        targetZones,
        durationHintMinutes:
          durationHintMinutes ?? plannedTriad?.durationMinutes ?? null,
        structuredSteps,
        steps,
        thresholdPaceSeconds,
      }),
    [
      discipline,
      displayUnit,
      sessionMetrics,
      targetZones,
      durationHintMinutes,
      plannedTriad?.durationMinutes,
      structuredSteps,
      steps,
      thresholdPaceSeconds,
    ]
  );

  const plannedZones =
    showPlannedZoneEditor && plannedZoneMinutes
      ? disciplineZoneMinutesFromPills(
          fitZoneMinuteValuesToDuration(
            plannedZoneMinutes,
            plannedZoneBudgetMinutes ?? plannedTriad?.durationMinutes ?? null
          ),
          discipline
        )
      : disciplineZoneMinutes(planned.zoneMinutes, discipline);

  const showEditable =
    editable &&
    plannedTriad &&
    completedTriad &&
    onPlannedTriadChange &&
    onCompletedTriadChange;

  const liveCompletedZones =
    showEditable && completedZoneMinutes
      ? disciplineZoneMinutesFromPills(completedZoneMinutes, discipline)
      : disciplineZoneMinutes(completed.zoneMinutes, discipline);
  const completedZones = liveCompletedZones;
  const plannedZoneTotal = Object.values(plannedZones).reduce((s, m) => s + m, 0);
  const completedZoneTotal = Object.values(completedZones).reduce((s, m) => s + m, 0);
  const chartScale = Math.max(plannedZoneTotal, completedZoneTotal, 1);
  const completedZoneBudgetMinutes = zoneDurationBudgetMinutes(
    completedTriad?.durationMinutes ?? null
  );
  const showPlannedZoneEditor =
    showEditable &&
    plannedZoneMinutes &&
    onPlannedZoneMinutesChange &&
    !hidePlannedZonePills;

  const durationPlanned = planned.stats.find((s) => s.label === "Duration")?.value ?? null;
  const distancePlanned = planned.stats.find((s) => s.label === "Distance")?.value ?? null;
  const durationCompleted = completedComparisonDuration(completed, discipline);
  const extraCompletedRows = extraCompletedSummaryStats(completed.stats, discipline);

  const paceLabel = discipline === "BIKE" ? "Avg speed" : "Avg pace";
  const pacePlanned = planned.stats.find((s) => s.label === paceLabel)?.value ?? null;
  const paceInputLabelText =
    discipline === "BIKE" ? speedInputLabel(displayUnit) : paceInputLabel(discipline, displayUnit);

  const plannedSessionHref =
    plannedSessionId && plannedSessionReturnTo
      ? `/plan/sessions/${plannedSessionId}?returnTo=${encodeURIComponent(plannedSessionReturnTo)}`
      : plannedSessionId
        ? `/plan/sessions/${plannedSessionId}`
        : null;

  return (
    <div>
      {linkedActivityId && hasCompletedOverride && onResetCompletedToActivity ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            Overrides file summary; streams and step execution still use the linked activity.
          </p>
          <Button type="button" variant="secondary" onClick={onResetCompletedToActivity}>
            Reset to activity
          </Button>
        </div>
      ) : null}
      {showEditable ? (
        <ComparisonMetricsEditor
          discipline={discipline}
          displayUnit={displayUnit}
          poolSize={poolSize}
          planned={plannedTriad}
          completed={completedTriad}
          onPlannedChange={onPlannedTriadChange}
          onCompletedChange={onCompletedTriadChange}
        />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-x-6 border-b border-zinc-200 pb-2 dark:border-zinc-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Planned</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Completed</p>
          </div>

          <dl className="space-y-3">
            <StatRow label="Duration" planned={durationPlanned} completed={durationCompleted} />
            <StatRow
              label={reportingDistanceInputLabel(discipline, displayUnit)}
              planned={distancePlanned}
              completed={completedStat(completed.stats, "Distance")}
            />
            <StatRow
              label={paceInputLabelText}
              planned={pacePlanned}
              completed={completedStat(completed.stats, paceLabel)}
            />
          </dl>
        </>
      )}

      {extraCompletedRows.length > 0 && (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {extraCompletedRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-zinc-500">{row.label}</dt>
                <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-5 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <p className="text-xs font-medium text-zinc-500">Zone time by zone</p>
        {structuredWorkoutWarning ? (
          <p className="text-xs text-zinc-500">{structuredWorkoutWarning}</p>
        ) : null}
        <div className="mb-2 grid grid-cols-2 gap-x-6">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Planned</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Completed
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {showPlannedZoneEditor ? (
              <div className="space-y-3">
                {plannedZoneTotal > 0 ? (
                  <PlanTizChart
                    discipline={discipline as Discipline}
                    values={plannedZones}
                    maxMinutes={chartScale}
                  />
                ) : (
                  <ComparisonValue value={null} />
                )}
                <ZoneMinutePills
                  values={plannedZoneMinutes}
                  maxTotalMinutes={plannedZoneBudgetMinutes}
                  onChange={onPlannedZoneMinutesChange}
                />
              </div>
            ) : plannedZoneTotal > 0 ? (
              <PlanTizChart
                discipline={discipline as Discipline}
                values={plannedZones}
                maxMinutes={chartScale}
              />
            ) : (
              <ComparisonValue value={null} />
            )}
          </div>
          <div>
            {showEditable && completedZoneMinutes && onCompletedZoneMinutesChange ? (
              <div className="space-y-3">
                <PlanTizChart
                  discipline={discipline as Discipline}
                  values={completedZones}
                  maxMinutes={chartScale}
                />
                <ZoneMinutePills
                  values={completedZoneMinutes}
                  maxTotalMinutes={completedZoneBudgetMinutes}
                  onChange={onCompletedZoneMinutesChange}
                />
              </div>
            ) : completedZoneTotal > 0 ? (
              <PlanTizChart
                discipline={discipline as Discipline}
                values={completedZones}
                maxMinutes={chartScale}
              />
            ) : (
              <ComparisonValue value={null} />
            )}
          </div>
        </div>
      </div>

      {showSessionEditLink && plannedSessionHref ? (
        <p className="mt-4 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-700">
          <Link href={plannedSessionHref} className="text-sky-600 hover:text-sky-800 dark:text-sky-400">
            Edit planned session →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
