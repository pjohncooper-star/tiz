import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivitySelfEval } from "@/components/activity-self-eval";
import { ActivityWorkoutChartCard } from "@/components/activity-workout-chart-card";
import { ActivityZoneTable } from "@/components/activity-zone-table";
import { PlannedSessionEditor } from "@/components/planned-session-editor";
import { SessionComponentProvenance } from "@/components/session-component-provenance";
import { SessionUploadButton } from "@/components/session-upload-button";
import { SwimLapPaceChart } from "@/components/swim-lap-pace-chart";
import { WorkoutStepExecution } from "@/components/workout-step-execution";
import { Card } from "@/components/ui";
import type { NormalizedStreams, WorkoutExecutionLap } from "@/lib/zones/compute";
import { requireAthlete } from "@/lib/auth/session";
import { formatDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseWorkoutTree } from "@/lib/workout/steps";
import {
  buildDisciplineSettings,
  unitSettingsForDiscipline,
} from "@/lib/units/discipline-settings";
import { resolveSessionReturnHref, sessionReturnLabel } from "@/lib/plan/session-return";
import { getCompletedSessionSnapshot } from "@/lib/plan/session-stats.server";
import { hasSessionCompletionOverride } from "@/lib/plan/session-completion";
import { getSignalPreferenceAtDate } from "@/lib/zones/signal-preference";
import { getThresholdProfileAtDate, parseZoneBoundaries } from "@/lib/zones/thresholds";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { parseSwimLapIntervals } from "@/lib/zones/swim-laps";

export const dynamic = "force-dynamic";

export default async function PlannedSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await requireAthlete();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const returnHref = resolveSessionReturnHref(returnTo);
  const athleteId = session.user.athleteId!;

  const plannedSession = await db.plannedSession.findFirst({
    where: { id, athleteId },
    include: {
      structuredWorkout: true,
      sessionComponentInstances: {
        orderBy: { paletteOrderIndex: "asc" },
        include: { component: true, progressionStep: true },
      },
    },
  });

  if (!plannedSession) notFound();

  const disciplineSettingsRows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
  });

  const disciplineSettings = buildDisciplineSettings(
    disciplineSettingsRows.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const displayUnit = unitSettingsForDiscipline(
    plannedSession.discipline,
    disciplineSettings
  ).displayUnit;

  const completed = await getCompletedSessionSnapshot(
    athleteId,
    plannedSession.scheduledDate,
    plannedSession.discipline,
    displayUnit,
    {
      plannedSessionId: plannedSession.id,
      linkedActivityId: plannedSession.linkedActivityId,
    }
  );

  const activityCompleted = plannedSession.linkedActivityId
    ? await getCompletedSessionSnapshot(
        athleteId,
        plannedSession.scheduledDate,
        plannedSession.discipline,
        displayUnit,
        { linkedActivityId: plannedSession.linkedActivityId }
      )
    : null;

  const hasCompletedOverride = hasSessionCompletionOverride(plannedSession);

  const settingsRow = disciplineSettingsRows.find(
    (s) => s.discipline === plannedSession.discipline
  );

  const preference = await getSignalPreferenceAtDate(
    athleteId,
    plannedSession.discipline,
    plannedSession.scheduledDate
  );
  const primarySignal =
    preference?.primarySignal ??
    settingsRow?.primarySignal ??
    (plannedSession.discipline === "BIKE" ? "POWER" : "PACE");

  let thresholdPaceSeconds: number | null = null;
  let thresholdZoneBoundaries: number[] | undefined;

  if (plannedSession.discipline === "RUN" || plannedSession.discipline === "SWIM") {
    const paceProfile = await getThresholdProfileAtDate(
      athleteId,
      plannedSession.discipline,
      "PACE",
      plannedSession.scheduledDate
    );
    thresholdPaceSeconds = paceProfile?.thresholdValue ?? null;
    if (primarySignal === "PACE" && paceProfile) {
      thresholdZoneBoundaries = parseZoneBoundaries(paceProfile.zoneBoundaries);
    }
  }

  const workoutTree = plannedSession.structuredWorkout
    ? parseWorkoutTree(plannedSession.structuredWorkout.steps)
    : undefined;

  const linkedActivity = plannedSession.linkedActivityId
    ? await db.syncedActivity.findFirst({
        where: { id: plannedSession.linkedActivityId, athleteId },
        include: {
          surveyResponse: true,
          zoneBreakdowns: {
            orderBy: [{ isCanonical: "desc" }, { zone: "asc" }],
            include: { thresholdProfile: true },
          },
        },
      })
    : null;

  let workoutLaps: WorkoutExecutionLap[] | undefined;
  let swimLaps = null;
  const canonicalZones = linkedActivity?.zoneBreakdowns.filter((z) => z.isCanonical) ?? [];
  const thresholdProfile = canonicalZones[0]?.thresholdProfile;

  if (linkedActivity?.rawStreams && typeof linkedActivity.rawStreams === "object") {
    const streams = linkedActivity.rawStreams as NormalizedStreams;
    const wl = streams.workoutLaps;
    workoutLaps = Array.isArray(wl) ? wl : wl?.data;
    if (plannedSession.discipline === "SWIM") {
      swimLaps = parseSwimLapIntervals(parseStoredStreams(linkedActivity.rawStreams));
    }
  }

  const scheduledDateKey = formatDateKey(plannedSession.scheduledDate);
  const structuredSteps = plannedSession.structuredWorkout?.steps;
  const showChart =
    linkedActivity &&
    (plannedSession.discipline === "BIKE" || plannedSession.discipline === "RUN");

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={returnHref}
          className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
        >
          ← Back to {sessionReturnLabel(returnHref)}
        </Link>
        <SessionUploadButton scheduledDate={scheduledDateKey} />
      </div>

      <PlannedSessionEditor
        sessionId={plannedSession.id}
        scheduledDate={scheduledDateKey}
        discipline={plannedSession.discipline}
        title={plannedSession.title}
        notes={plannedSession.notes ?? ""}
        distanceMeters={plannedSession.distanceMeters}
        targetSpeedMps={plannedSession.targetSpeedMps}
        targetPaceSeconds={plannedSession.targetPaceSeconds}
        poolSize={plannedSession.poolSize}
        targetZones={plannedSession.targetZones}
        hasStructuredWorkout={!!plannedSession.structuredWorkout}
        disciplineSettings={disciplineSettings}
        completed={completed}
        activityCompleted={activityCompleted}
        linkedActivityId={plannedSession.linkedActivityId}
        hasCompletedOverride={hasCompletedOverride}
        initialCompletedZones={plannedSession.completedZones}
        workoutTree={workoutTree}
        thresholdPaceSeconds={thresholdPaceSeconds}
        thresholdZoneBoundaries={thresholdZoneBoundaries}
        primarySignal={primarySignal}
        sessionSource={plannedSession.source}
        returnHref={returnHref}
      >
        {showChart && linkedActivity ? (
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
        ) : null}

        {structuredSteps && workoutLaps && workoutLaps.length > 0 ? (
          <WorkoutStepExecution
            plannedSteps={structuredSteps}
            workoutLaps={workoutLaps}
            discipline={plannedSession.discipline}
          />
        ) : null}

        {swimLaps && swimLaps.length > 0 ? (
          <Card title="Lap pace">
            <SwimLapPaceChart laps={swimLaps} displayUnit={displayUnit} />
          </Card>
        ) : null}

        {linkedActivity ? (
          <Card title="Time in zone">
            {canonicalZones.length === 0 || !thresholdProfile ? (
              <p className="text-sm text-zinc-500">No zone data</p>
            ) : (
              <ActivityZoneTable
                rows={canonicalZones}
                profile={thresholdProfile}
                discipline={linkedActivity.discipline}
                displayUnit={displayUnit}
              />
            )}
          </Card>
        ) : null}

        {linkedActivity?.surveyResponse ? (
          <Card title="Self evaluation">
            <ActivitySelfEval
              rpe={linkedActivity.surveyResponse.rpe}
              freshness={linkedActivity.surveyResponse.freshness}
              dayQualityFlag={linkedActivity.surveyResponse.dayQualityFlag}
              source={linkedActivity.surveyResponse.source}
            />
          </Card>
        ) : null}

        <SessionComponentProvenance instances={plannedSession.sessionComponentInstances} />
      </PlannedSessionEditor>
    </main>
  );
}
