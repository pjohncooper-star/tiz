"use client";

import type { ActivityCardMetrics } from "@/lib/plan/calendar/session-card-summary";
import { metricPillClassName } from "@/lib/plan/workout-shading";

type CalendarActivityMetricGridProps = {
  metrics: ActivityCardMetrics;
};

export function CalendarActivityMetricGrid({ metrics }: CalendarActivityMetricGridProps) {
  if (!metrics.hasAny) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {metrics.duration != null ? (
        <span className={metricPillClassName("gray")}>{metrics.duration}</span>
      ) : null}
      {metrics.distance != null ? (
        <span className={metricPillClassName("gray")}>{metrics.distance}</span>
      ) : null}
    </div>
  );
}
