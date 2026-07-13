import Link from "next/link";
import { DisciplineUnitsSettings } from "@/components/discipline-units-settings";
import { SelfEvalSettingsPanel } from "@/components/self-eval-settings-panel";
import { WorkoutShadingSettingsPanel } from "@/components/workout-shading-settings";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { buildWorkoutShadingSettings, parseWorkoutShadingTarget } from "@/lib/plan/workout-shading";
import { parseSelfEvalConfig } from "@/lib/survey/self-eval-config";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";
import { parsePhaseKindZoneDefaults } from "@/lib/plan/season/phase-zone-defaults";
import { parseZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { ZoneFocusSettingsPanel } from "@/components/zone-focus-settings-panel";
import { signalLabel } from "@/lib/zones/display";

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
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /phaseKindZoneDefaults|PhaseKindZoneDefaults|zoneFocusCatalog|ZoneFocusCatalog|column/.test(
        error.message
      )
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
    throw error;
  }
}

export default async function SettingsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [connection, settings, athlete] = await Promise.all([
    db.stravaConnection.findUnique({ where: { athleteId } }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
    loadAthleteSettingsProfile(athleteId),
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card title="Units">
        <DisciplineUnitsSettings initialSettings={disciplineSettings} />
      </Card>
      <Card title="Workout shading">
        <WorkoutShadingSettingsPanel
          initialSettings={workoutShadingSettings}
          initialShadingTarget={workoutShadingTarget}
        />
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
      <Card title="Zone focus">
        <ZoneFocusSettingsPanel
          initialSettings={{ zoneFocusCatalog, phaseKindZoneDefaults }}
        />
      </Card>
      <Card title="Thresholds & TiZ">
        <ul className="space-y-2 text-sm">
          {settings
            .filter((s) => s.discipline === "BIKE" || s.discipline === "RUN" || s.discipline === "SWIM")
            .map((s) => (
              <li key={s.discipline}>
                <span className="font-medium">{s.discipline}</span>
                <span className="text-zinc-500">
                  {" "}
                  — primary TiZ metric: {signalLabel(s.primarySignal)}
                  {s.fallbackSignal ? ` (fallback: ${signalLabel(s.fallbackSignal)})` : ""}
                </span>
              </li>
            ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/onboarding/thresholds" className="text-sky-600 hover:underline">
            Edit current thresholds & zone boundaries
          </Link>
          <Link href="/onboarding/threshold-history" className="text-sky-600 hover:underline">
            Threshold & primary metric history
          </Link>
        </div>
      </Card>
    </main>
  );
}
