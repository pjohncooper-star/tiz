import { DisciplineUnitsSettings } from "@/components/discipline-units-settings";
import { WorkoutShadingSettingsPanel } from "@/components/workout-shading-settings";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import {
  buildWorkoutShadingSettings,
  parseWorkoutShadingTarget,
} from "@/lib/plan/workout-shading";
import {
  loadAthleteSettingsProfile,
  loadDisciplineSettingRows,
} from "@/lib/settings/athlete-settings.server";
import { buildDisciplineSettings } from "@/lib/units/discipline-settings";

export const dynamic = "force-dynamic";

export default async function UnitsSettingsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [settings, athlete] = await Promise.all([
    loadDisciplineSettingRows(athleteId),
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

  return (
    <>
      <Card title="Units">
        <DisciplineUnitsSettings initialSettings={disciplineSettings} />
      </Card>
      <Card title="Workout shading">
        <WorkoutShadingSettingsPanel
          initialSettings={workoutShadingSettings}
          initialShadingTarget={workoutShadingTarget}
        />
      </Card>
    </>
  );
}
