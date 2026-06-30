import type { Discipline } from "@prisma/client";
import { ActivityStreamsChart } from "@/components/activity-streams-chart";
import { Card } from "@/components/ui";
import { resolveActivityStreamChart } from "@/lib/activity/resolve-activity-stream-chart";
import { db } from "@/lib/db";
import type { DisplayUnit } from "@/lib/workout/metrics";

type ActivityWorkoutChartCardProps = {
  athleteId: string;
  activityId: string;
  displayUnit: DisplayUnit;
  structuredSteps?: unknown;
  activity?: {
    discipline: Discipline;
    rawStreams: unknown;
    durationSeconds: number | null;
    startTime: Date;
  };
};

export async function ActivityWorkoutChartCard({
  athleteId,
  activityId,
  displayUnit,
  structuredSteps,
  activity: preloaded,
}: ActivityWorkoutChartCardProps) {
  const activity =
    preloaded ??
    (await db.syncedActivity.findFirst({
      where: { id: activityId, athleteId },
      select: {
        discipline: true,
        rawStreams: true,
        durationSeconds: true,
        startTime: true,
      },
    }));
  if (!activity) return null;

  const chart = await resolveActivityStreamChart({
    athleteId,
    discipline: activity.discipline,
    displayUnit,
    rawStreams: activity.rawStreams,
    durationSeconds: activity.durationSeconds,
    activityStartTime: activity.startTime,
    structuredSteps,
  });
  if (!chart) return null;

  return (
    <Card title={chart.chartTitle}>
      <ActivityStreamsChart
        points={chart.points}
        displayUnit={chart.displayUnit}
        discipline={chart.discipline}
        available={chart.metrics}
        overlay={chart.overlay}
      />
    </Card>
  );
}
