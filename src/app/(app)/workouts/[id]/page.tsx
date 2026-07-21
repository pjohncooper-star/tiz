import Link from "next/link";
import { PlannedSessionEditor } from "@/components/planned-session-editor";
import { SessionUploadButton } from "@/components/session-upload-button";
import { SessionWorkoutProvenance } from "@/components/session-workout-provenance";
import { WorkoutDetailAnalysis } from "@/components/workout-detail-analysis";
import { requireAthlete } from "@/lib/auth/session";
import { loadWorkoutDetail } from "@/lib/plan/workout-detail.server";
import { workoutReturnLabel } from "@/lib/plan/workout-return";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await requireAthlete();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const athleteId = session.user.athleteId!;
  const viewModel = await loadWorkoutDetail(athleteId, id, returnTo);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={viewModel.returnHref}
          className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
        >
          ← Back to {workoutReturnLabel(viewModel.returnHref)}
        </Link>
        <SessionUploadButton scheduledDate={viewModel.scheduledDateKey} />
      </div>

      <PlannedSessionEditor
        sessionId={viewModel.sessionId}
        scheduledDate={viewModel.scheduledDateKey}
        discipline={viewModel.discipline}
        title={viewModel.title}
        notes={viewModel.notes}
        distanceMeters={viewModel.distanceMeters}
        targetSpeedMps={viewModel.targetSpeedMps}
        targetPaceSeconds={viewModel.targetPaceSeconds}
        poolSize={viewModel.poolSize}
        targetZones={viewModel.targetZones}
        hasStructuredWorkout={viewModel.hasStructuredWorkout}
        disciplineSettings={viewModel.disciplineSettings}
        completed={viewModel.completed}
        activityCompleted={viewModel.activityCompleted}
        linkedActivityId={viewModel.linkedActivityId}
        hasCompletedOverride={viewModel.hasCompletedOverride}
        initialCompletedZones={viewModel.initialCompletedZones}
        workoutTree={viewModel.workoutTree}
        thresholdPaceSeconds={viewModel.thresholdPaceSeconds}
        thresholdZoneBoundaries={viewModel.thresholdZoneBoundaries}
        primarySignal={viewModel.primarySignal}
        inheritedPrimarySignal={viewModel.inheritedPrimarySignal}
        prescriptionSignal={viewModel.prescriptionSignal}
        sessionRole={viewModel.sessionRole}
        tizSignalOverride={viewModel.tizSignalOverride}
        sessionSource={viewModel.sessionSource}
        returnHref={viewModel.returnHref}
      >
        <WorkoutDetailAnalysis viewModel={viewModel} />
        <SessionWorkoutProvenance source={viewModel.workoutSource} />
      </PlannedSessionEditor>
    </main>
  );
}
