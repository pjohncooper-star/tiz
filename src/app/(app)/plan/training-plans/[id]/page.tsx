import Link from "next/link";
import { notFound } from "next/navigation";
import { TrainingPlanEditor } from "@/components/training-plan-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadPaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import {
  getTrainingPlanDetail,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function TrainingPlanEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const { id } = await params;

  let plan;
  try {
    plan = await getTrainingPlanDetail(athleteId, id);
  } catch (e) {
    if (e instanceof TrainingPlanError && e.status === 404) notFound();
    throw e;
  }

  const [disciplineSettingsRows, paceCtx] = await Promise.all([
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    loadPaceThresholdContext(athleteId),
  ]);
  const disciplineSettings = buildDisciplineSettings(
    disciplineSettingsRows.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const thresholdByDiscipline = {
    RUN: {
      paceSeconds: paceCtx.RUN?.thresholdPaceSeconds ?? null,
      ftpWatts: null as number | null,
    },
    SWIM: {
      paceSeconds: paceCtx.SWIM?.thresholdPaceSeconds ?? null,
      ftpWatts: null as number | null,
    },
    BIKE: {
      paceSeconds: paceCtx.BIKE?.thresholdPaceSeconds ?? null,
      ftpWatts: paceCtx.BIKE?.thresholdFtpWatts ?? null,
    },
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <Link
        href="/plan/training-plans"
        className="text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        ← Back to training plans
      </Link>
      <h1 className="text-2xl font-semibold">Edit training plan</h1>
      <p className="text-sm text-zinc-500">
        Changes here update the library only. Applied calendar sessions are separate copies.
      </p>
      <TrainingPlanEditor
        initialPlan={plan}
        disciplineSettings={disciplineSettings}
        racePaces={paceCtx.racePaces ?? null}
        thresholdByDiscipline={thresholdByDiscipline}
      />
    </main>
  );
}
