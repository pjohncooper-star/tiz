"use client";

import type { SessionCardMetrics } from "@/lib/plan/calendar/session-card-summary";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  metricPillClassName,
  plannedMetricPillClassName,
  resolveCompletedMetricPillTone,
  type WorkoutShadingSettings,
  type WorkoutShadingTarget,
} from "@/lib/plan/workout-shading";

type CalendarSessionMetricGridProps = {
  metrics: SessionCardMetrics;
  session: CalendarPlannedSession;
  shadingSettings: WorkoutShadingSettings;
  shadingTarget: WorkoutShadingTarget;
};

function MetricPill({
  value,
  className,
}: {
  value: string | null;
  className: string;
}) {
  if (value == null) {
    return <span className="text-[10px] text-zinc-400">—</span>;
  }
  return <span className={className}>{value}</span>;
}

function MetricRow({
  planned,
  completed,
  completedClassName,
}: {
  planned: string | null;
  completed: string | null;
  completedClassName: string;
}) {
  if (planned == null && completed == null) return null;

  return (
    <>
      <MetricPill value={planned} className={plannedMetricPillClassName()} />
      <MetricPill value={completed} className={completedClassName} />
    </>
  );
}

export function CalendarSessionMetricGrid({
  metrics,
  session,
  shadingSettings,
  shadingTarget,
}: CalendarSessionMetricGridProps) {
  if (!metrics.hasAny) return null;

  const durationTone = resolveCompletedMetricPillTone(
    session,
    shadingSettings,
    "duration",
    shadingTarget
  );
  const distanceTone = resolveCompletedMetricPillTone(
    session,
    shadingSettings,
    "distance",
    shadingTarget
  );

  return (
    <div className="mt-1 grid grid-cols-2 items-center gap-x-1.5 gap-y-0.5 text-[10px]">
      <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">Planned</span>
      <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">
        Completed
      </span>
      <MetricRow
        planned={metrics.duration.planned}
        completed={metrics.duration.completed}
        completedClassName={metricPillClassName(durationTone)}
      />
      <MetricRow
        planned={metrics.distance.planned}
        completed={metrics.distance.completed}
        completedClassName={metricPillClassName(distanceTone)}
      />
    </div>
  );
}
