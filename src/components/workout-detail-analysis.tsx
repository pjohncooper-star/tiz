import { ActivitySelfEvalEditor } from "@/components/activity-self-eval-editor";
import { ActivitySummary } from "@/components/activity-summary";
import { ActivityWorkoutChartCard } from "@/components/activity-workout-chart-card";
import { ActivityZoneTable } from "@/components/activity-zone-table";
import { SwimLapPaceChart } from "@/components/swim-lap-pace-chart";
import { WorkoutStepExecution } from "@/components/workout-step-execution";
import { Card } from "@/components/ui";
import type { WorkoutDetailViewModel } from "@/lib/plan/workout-detail.server";
import type { DisplayUnit } from "@prisma/client";

type WorkoutDetailAnalysisProps = {
  viewModel: Pick<
    WorkoutDetailViewModel,
    | "athleteId"
    | "discipline"
    | "displayUnit"
    | "structuredSteps"
    | "linkedActivity"
    | "selfEvalConfig"
    | "ecoLoadEnabled"
    | "workoutLaps"
    | "swimLaps"
    | "showExecutionChart"
    | "isEndurance"
    | "summaryStats"
  >;
};

export function WorkoutDetailAnalysis({ viewModel }: WorkoutDetailAnalysisProps) {
  const {
    athleteId,
    discipline,
    displayUnit,
    structuredSteps,
    linkedActivity,
    selfEvalConfig,
    ecoLoadEnabled,
    workoutLaps,
    swimLaps,
    showExecutionChart,
    isEndurance,
    summaryStats,
  } = viewModel;

  const canonicalZones = linkedActivity?.zoneBreakdowns.filter((z) => z.isCanonical) ?? [];
  const thresholdProfile = canonicalZones[0]?.thresholdProfile;

  return (
    <>
      {!isEndurance && summaryStats.length > 0 ? (
        <Card title="Summary">
          <ActivitySummary stats={summaryStats} />
        </Card>
      ) : null}

      {ecoLoadEnabled ? (
        <Card title="ECO load">
          {linkedActivity?.ecos != null ? (
            <p className="text-2xl font-semibold tabular-nums">
              {Math.round(linkedActivity.ecos)}{" "}
              <span className="text-sm font-normal text-zinc-500">ECOs</span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">
              {linkedActivity?.ecoComputed
                ? "No usable signal for ECO on this session"
                : "ECO not computed yet — load recalculates with zone recompute"}
            </p>
          )}
        </Card>
      ) : null}

      {showExecutionChart && linkedActivity ? (
        <ActivityWorkoutChartCard
          athleteId={athleteId}
          activityId={linkedActivity.id}
          displayUnit={displayUnit}
          structuredSteps={structuredSteps}
          activity={{
            discipline: linkedActivity.discipline,
            rawStreams: linkedActivity.rawStreams,
            durationSeconds: linkedActivity.durationSeconds,
            startTime: linkedActivity.startTime,
          }}
        />
      ) : (
        <Card title="Execution">
          <p className="text-sm text-zinc-500">Complete a workout to see analysis</p>
        </Card>
      )}

      {structuredSteps && workoutLaps && workoutLaps.length > 0 ? (
        <WorkoutStepExecution
          plannedSteps={structuredSteps}
          workoutLaps={workoutLaps}
          discipline={discipline}
        />
      ) : null}

      {swimLaps && swimLaps.length > 0 ? (
        <Card title="Lap pace">
          <SwimLapPaceChart laps={swimLaps} displayUnit={displayUnit} />
        </Card>
      ) : null}

      <Card title="Time in zone">
        {!linkedActivity || canonicalZones.length === 0 || !thresholdProfile ? (
          <p className="text-sm text-zinc-500">No zone data</p>
        ) : (
          <ActivityZoneTable
            rows={canonicalZones}
            profile={thresholdProfile}
            discipline={linkedActivity.discipline}
            displayUnit={displayUnit as DisplayUnit}
          />
        )}
      </Card>

      <Card title="Self evaluation">
        {linkedActivity ? (
          <ActivitySelfEvalEditor
            activityId={linkedActivity.id}
            initialSurvey={
              linkedActivity.surveyResponse
                ? {
                    rpe: linkedActivity.surveyResponse.rpe,
                    freshness: linkedActivity.surveyResponse.freshness,
                    sleep: linkedActivity.surveyResponse.sleep,
                    motivation: linkedActivity.surveyResponse.motivation,
                    soreness: linkedActivity.surveyResponse.soreness,
                    note: linkedActivity.surveyResponse.note,
                    customFields: linkedActivity.surveyResponse.customFields,
                    dayQualityFlag: linkedActivity.surveyResponse.dayQualityFlag,
                    source: linkedActivity.surveyResponse.source,
                  }
                : null
            }
            fieldConfig={selfEvalConfig}
          />
        ) : (
          <p className="text-sm text-zinc-500">No self evaluation recorded</p>
        )}
      </Card>
    </>
  );
}
