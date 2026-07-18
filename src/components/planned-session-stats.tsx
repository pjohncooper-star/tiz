"use client";

import { SessionComparisonSummary } from "@/components/session-comparison-summary";
import type { ZoneMinuteValues } from "@/components/zone-minute-pills";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import type { DisplayUnit } from "@/lib/workout/metrics";
import type { PoolSize } from "@/lib/units/discipline-settings";

type PlannedSessionStatsProps = {
  discipline: PlanDiscipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  targetZones: unknown;
  structuredSteps?: unknown;
  thresholdPaceSeconds?: number | null;
  thresholdZoneBoundaries?: number[];
  plannedTriad: PlannedMetricsTriadValues;
  completedTriad: PlannedMetricsTriadValues;
  onPlannedTriadChange: (values: PlannedMetricsTriadValues) => void;
  onCompletedTriadChange: (values: PlannedMetricsTriadValues) => void;
  completedZoneMinutes: ZoneMinuteValues;
  onCompletedZoneMinutesChange: (
    zone: import("@/components/zone-minute-pills").ZoneNumber,
    value: string
  ) => void;
  plannedZoneMinutes: ZoneMinuteValues;
  onPlannedZoneMinutesChange: (
    zone: import("@/components/zone-minute-pills").ZoneNumber,
    value: string
  ) => void;
  plannedZoneBudgetMinutes: number | null;
  hidePlannedZonePills?: boolean;
  structuredWorkoutWarning?: string | null;
  linkedActivityId?: string | null;
  hasCompletedOverride?: boolean;
  onResetCompletedToActivity?: () => void;
  completed: CompletedSessionSnapshot;
};

export function PlannedSessionStats({
  discipline,
  displayUnit,
  poolSize,
  targetZones,
  structuredSteps,
  thresholdPaceSeconds,
  thresholdZoneBoundaries,
  plannedTriad,
  completedTriad,
  onPlannedTriadChange,
  onCompletedTriadChange,
  completedZoneMinutes,
  onCompletedZoneMinutesChange,
  plannedZoneMinutes,
  onPlannedZoneMinutesChange,
  plannedZoneBudgetMinutes,
  hidePlannedZonePills = false,
  structuredWorkoutWarning = null,
  linkedActivityId,
  hasCompletedOverride,
  onResetCompletedToActivity,
  completed,
}: PlannedSessionStatsProps) {
  const sessionMetrics = {
    distanceMeters: plannedTriad.distanceMeters,
    targetSpeedMps: plannedTriad.targetSpeedMps,
    targetPaceSeconds: plannedTriad.targetPaceSeconds,
  };

  return (
    <SessionComparisonSummary
        discipline={discipline}
        displayUnit={displayUnit}
        targetZones={targetZones}
        structuredSteps={structuredSteps}
        durationHintMinutes={plannedTriad.durationMinutes}
        thresholdPaceSeconds={thresholdPaceSeconds}
        thresholdZoneBoundaries={thresholdZoneBoundaries}
        sessionMetrics={sessionMetrics}
        completed={completed}
        editable
        poolSize={poolSize}
        plannedTriad={plannedTriad}
        completedTriad={completedTriad}
        onPlannedTriadChange={onPlannedTriadChange}
        onCompletedTriadChange={onCompletedTriadChange}
        completedZoneMinutes={completedZoneMinutes}
        onCompletedZoneMinutesChange={onCompletedZoneMinutesChange}
        plannedZoneMinutes={plannedZoneMinutes}
        onPlannedZoneMinutesChange={onPlannedZoneMinutesChange}
        plannedZoneBudgetMinutes={plannedZoneBudgetMinutes}
        hidePlannedZonePills={hidePlannedZonePills}
        structuredWorkoutWarning={structuredWorkoutWarning}
        linkedActivityId={linkedActivityId}
        hasCompletedOverride={hasCompletedOverride}
        onResetCompletedToActivity={onResetCompletedToActivity}
      />
  );
}
