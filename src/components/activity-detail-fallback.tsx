import { format } from "date-fns";
import Link from "next/link";
import { ActivitySelfEval } from "@/components/activity-self-eval";
import { ActivitySummary } from "@/components/activity-summary";
import { ActivityWorkoutChartCard } from "@/components/activity-workout-chart-card";
import { SwimLapPaceChart } from "@/components/swim-lap-pace-chart";
import { ActivityZoneTable } from "@/components/activity-zone-table";
import { Card } from "@/components/ui";
import { computeActivitySummary } from "@/lib/activity/summary";
import { activityReturnLabel } from "@/lib/plan/activity-return";
import type { PlanDiscipline } from "@/lib/plan/session";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { parseSwimLapIntervals } from "@/lib/zones/swim-laps";
import type {
  DisplayUnit,
  SurveyResponse,
  SyncedActivity,
  ThresholdProfile,
  ZoneBreakdown,
} from "@prisma/client";

const ENDURANCE_DISCIPLINES = new Set<PlanDiscipline>(["BIKE", "RUN", "SWIM"]);

type ActivityDetailFallbackProps = {
  athleteId: string;
  returnHref: string;
  activity: SyncedActivity & {
    surveyResponse: SurveyResponse | null;
    zoneBreakdowns: (ZoneBreakdown & { thresholdProfile: ThresholdProfile | null })[];
  };
  displayUnit: DisplayUnit;
};

export function ActivityDetailFallback({
  athleteId,
  returnHref,
  activity,
  displayUnit,
}: ActivityDetailFallbackProps) {
  const isEndurance = ENDURANCE_DISCIPLINES.has(activity.discipline as PlanDiscipline);
  const canonical = activity.zoneBreakdowns.filter((z) => z.isCanonical);
  const streams = parseStoredStreams(activity.rawStreams);
  const swimLaps =
    activity.discipline === "SWIM" ? parseSwimLapIntervals(streams) : null;
  const thresholdProfile = canonical[0]?.thresholdProfile;
  const summaryStats = computeActivitySummary({
    discipline: activity.discipline,
    durationSeconds: activity.durationSeconds,
    distanceMeters: activity.distanceMeters,
    streams,
    displayUnit,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link href={returnHref} className="text-sm text-sky-600">
        ← Back to {activityReturnLabel(returnHref)}
      </Link>
      <h1 className="text-2xl font-semibold">{activity.name}</h1>
      <p className="text-sm text-zinc-500">
        {format(activity.startTime, "EEEE MMM d, yyyy")} · {activity.discipline}
      </p>
      {!isEndurance && summaryStats.length > 0 && (
        <Card title="Summary">
          <ActivitySummary stats={summaryStats} />
        </Card>
      )}
      {activity.surveyResponse && (
        <Card title="Self evaluation">
          <ActivitySelfEval
            rpe={activity.surveyResponse.rpe}
            freshness={activity.surveyResponse.freshness}
            dayQualityFlag={activity.surveyResponse.dayQualityFlag}
            source={activity.surveyResponse.source}
          />
        </Card>
      )}
      <ActivityWorkoutChartCard
        athleteId={athleteId}
        activityId={activity.id}
        displayUnit={displayUnit}
        activity={{
          discipline: activity.discipline,
          rawStreams: activity.rawStreams,
          durationSeconds: activity.durationSeconds,
          startTime: activity.startTime,
        }}
      />
      {swimLaps && swimLaps.length > 0 && (
        <Card title="Lap pace">
          <SwimLapPaceChart laps={swimLaps} displayUnit={displayUnit} />
        </Card>
      )}
      <Card title="Time in zone">
        {canonical.length === 0 || !thresholdProfile ? (
          <p className="text-sm text-zinc-500">No zone data</p>
        ) : (
          <ActivityZoneTable
            rows={canonical}
            profile={thresholdProfile}
            discipline={activity.discipline}
            displayUnit={displayUnit}
          />
        )}
      </Card>
    </main>
  );
}
