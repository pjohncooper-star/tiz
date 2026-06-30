"use client";

import { Card } from "@/components/ui";
import { SessionComparisonSummary } from "@/components/session-comparison-summary";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit, SessionMetrics } from "@/lib/workout/metrics";

type ActivitySessionComparisonProps = {
  discipline: PlanDiscipline;
  displayUnit: DisplayUnit;
  steps?: import("@/lib/workout/steps").WorkoutStep[];
  structuredSteps?: unknown;
  targetZones?: unknown;
  sessionMetrics: SessionMetrics;
  completed: CompletedSessionSnapshot;
  plannedSessionId?: string | null;
  plannedSessionReturnTo?: string;
};

export function ActivitySessionComparison(props: ActivitySessionComparisonProps) {
  return (
    <Card title="Summary">
      <SessionComparisonSummary
        {...props}
        showSessionEditLink={Boolean(props.plannedSessionId)}
      />
    </Card>
  );
}
