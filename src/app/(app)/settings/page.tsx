import { TrainingPlanCsvSettings } from "@/components/training-plan-csv-settings";
import { DisciplineUnitsSettings } from "@/components/discipline-units-settings";
import { EcoLoadSettingsPanel } from "@/components/eco-load-settings-panel";
import { SelfEvalSettingsPanel } from "@/components/self-eval-settings-panel";
import { WorkoutShadingSettingsPanel } from "@/components/workout-shading-settings";
import { Card } from "@/components/ui";
import { ThresholdsEditor } from "@/components/thresholds/thresholds-editor";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildWorkoutShadingSettings, parseWorkoutShadingTarget } from "@/lib/plan/workout-shading";
import { parseSelfEvalConfig } from "@/lib/survey/self-eval-config";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import { parsePhaseKindZoneDefaults } from "@/lib/plan/season/phase-zone-defaults";
import { parseZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { ZoneFocusSettingsPanel } from "@/components/zone-focus-settings-panel";
import { loadThresholdsEditorData } from "@/lib/thresholds/load-editor-data.server";

export const dynamic = "force-dynamic";

async function loadAthleteSettingsProfile(athleteId: string) {
  try {
    return await db.athlete.findUnique({
      where: { id: athleteId },
      select: {
        strengthPastWorkoutShading: true,
        selfEvalConfig: true,
        workoutShadingTarget: true,
        phaseKindZoneDefaults: true,
        zoneFocusCatalog: true,
        ecoLoadEnabled: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /phaseKindZoneDefaults|PhaseKindZoneDefaults|zoneFocusCatalog|ZoneFocusCatalog|ecoLoadEnabled|column/.test(
        error.message
      )
    ) {
      try {
        return await db.athlete.findUnique({
          where: { id: athleteId },
          select: {
            strengthPastWorkoutShading: true,
            selfEvalConfig: true,
            workoutShadingTarget: true,
            ecoLoadEnabled: true,
          },
        });
      } catch (inner) {
        if (
          inner instanceof Error &&
          /ecoLoadEnabled|column/.test(inner.message)
        ) {
          return db.athlete.findUnique({
            where: { id: athleteId },
            select: {
              strengthPastWorkoutShading: true,
              selfEvalConfig: true,
              workoutShadingTarget: true,
            },
          });
        }
        throw inner;
      }
    }
    throw error;
  }
}

export default async function SettingsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [connection, settings, athlete, thresholdsData] = await Promise.all([
    db.stravaConnection.findUnique({ where: { athleteId } }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    loadAthleteSettingsProfile(athleteId),
    loadThresholdsEditorData(athleteId),
  ]);

  const disciplineSettings = buildDisciplineSettings(
    settings.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const workoutShadingSettings = buildWorkoutShadingSettings(
    settings.map((s) => ({
      discipline: s.discipline,
      pastWorkoutShading: s.pastWorkoutShading,
    })),
    athlete?.strengthPastWorkoutShading
  );

  const workoutShadingTarget = parseWorkoutShadingTarget(athlete?.workoutShadingTarget);

  const selfEvalConfig = parseSelfEvalConfig(athlete?.selfEvalConfig);
  const phaseKindZoneDefaults = parsePhaseKindZoneDefaults(
    athlete && "phaseKindZoneDefaults" in athlete ? athlete.phaseKindZoneDefaults : null
  );
  const zoneFocusCatalog = parseZoneFocusCatalog(
    athlete && "zoneFocusCatalog" in athlete ? athlete.zoneFocusCatalog : null
  );
  const ecoLoadEnabled =
    athlete && "ecoLoadEnabled" in athlete
      ? Boolean(athlete.ecoLoadEnabled)
      : false;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card title="Units">
        <DisciplineUnitsSettings initialSettings={disciplineSettings} />
      </Card>
      <Card title="Intensity zones & thresholds">
        <ThresholdsEditor
          initialData={thresholdsData}
          historyHref="/settings/thresholds/history"
        />
      </Card>
      <Card title="Zone focus (time distribution)">
        <ZoneFocusSettingsPanel
          initialSettings={{ zoneFocusCatalog, phaseKindZoneDefaults }}
        />
      </Card>
      <Card title="Training plans & CSV">
        <div id="calendar-import">
          <TrainingPlanCsvSettings />
        </div>
      </Card>
      <Card title="Workout shading">
        <WorkoutShadingSettingsPanel
          initialSettings={workoutShadingSettings}
          initialShadingTarget={workoutShadingTarget}
        />
      </Card>
      <Card title="Training load (ECO)">
        <EcoLoadSettingsPanel initialEnabled={ecoLoadEnabled} />
      </Card>
      <Card title="Self evaluation">
        <SelfEvalSettingsPanel initialConfig={selfEvalConfig} />
      </Card>
      <Card title="Strava">
        {connection ? (
          <p className="text-sm">Connected (athlete #{connection.stravaAthleteId.toString()})</p>
        ) : (
          <a
            href="/api/strava/connect?returnTo=/settings"
            className="text-sm text-sky-600"
          >
            Connect Strava
          </a>
        )}
      </Card>
    </main>
  );
}
