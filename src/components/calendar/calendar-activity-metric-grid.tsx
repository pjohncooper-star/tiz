"use client";

import type { ActivityCardMetrics } from "@/lib/plan/calendar/session-card-summary";
import { metricPillClassName } from "@/lib/plan/workout-shading";

type CalendarActivityMetricGridProps = {
  metrics: ActivityCardMetrics;
};

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (value == null) return null;

  return (
    <>
      <span className="text-[10px] text-zinc-400">{label}</span>
      <span className={metricPillClassName("gray")}>{value}</span>
    </>
  );
}

export function CalendarActivityMetricGrid({ metrics }: CalendarActivityMetricGridProps) {
  if (!metrics.hasAny) return null;

  return (
    <div className="mt-1 grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-0.5">
      <MetricRow label="Duration" value={metrics.duration} />
      <MetricRow label="Distance" value={metrics.distance} />
    </div>
  );
}
