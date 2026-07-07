import type { PlanDiscipline } from "@/lib/plan/session";
import { hoursFromDistancePace } from "@/lib/plan/season/distance-pace-rollup";
import type { DisciplineRampDefaults, SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import {
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import {
  reportingDistanceInputToMeters,
  reportingDistanceMetersToInput,
  stepPaceCanonicalToInput,
  stepPaceInputLabel,
  stepPaceInputToCanonical,
} from "@/lib/workout/metrics";

export function swimDistanceDisplayUnit(settings: Record<PlanDiscipline, DisciplineUnitSettings>) {
  return swimDisplayUnit(settings.SWIM.poolSize);
}

export function distanceInputLabel(
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (discipline === "SWIM") {
    const unit = swimDistanceDisplayUnit(settings);
    return unit === "METRIC" ? "Distance (m/wk)" : "Distance (yd/wk)";
  }
  const displayUnit = unitSettingsForDiscipline("RUN", settings).displayUnit;
  return displayUnit === "METRIC" ? "Distance (km/wk)" : "Distance (mi/wk)";
}

export function distanceMetersToDisplay(
  meters: number | null | undefined,
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (discipline === "SWIM") {
    return reportingDistanceMetersToInput(
      meters,
      "SWIM",
      swimDistanceDisplayUnit(settings)
    );
  }
  return reportingDistanceMetersToInput(
    meters,
    "RUN",
    unitSettingsForDiscipline("RUN", settings).displayUnit
  );
}

export function distanceDisplayToMeters(
  input: string,
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): number | null {
  if (discipline === "SWIM") {
    return reportingDistanceInputToMeters(
      input,
      "SWIM",
      swimDistanceDisplayUnit(settings)
    );
  }
  return reportingDistanceInputToMeters(
    input,
    "RUN",
    unitSettingsForDiscipline("RUN", settings).displayUnit
  );
}

export function paceInputLabelFor(
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (discipline === "SWIM") {
    return stepPaceInputLabel("SWIM", swimDistanceDisplayUnit(settings), settings.SWIM.poolSize);
  }
  return stepPaceInputLabel(
    "RUN",
    unitSettingsForDiscipline("RUN", settings).displayUnit,
    null
  );
}

export function paceCanonicalToDisplay(
  seconds: number,
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (discipline === "SWIM") {
    return stepPaceCanonicalToInput(
      seconds,
      "SWIM",
      swimDistanceDisplayUnit(settings),
      settings.SWIM.poolSize
    );
  }
  return stepPaceCanonicalToInput(
    seconds,
    "RUN",
    unitSettingsForDiscipline("RUN", settings).displayUnit,
    null
  );
}

export function paceDisplayToCanonical(
  input: string,
  discipline: "SWIM" | "RUN",
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): number | null {
  if (discipline === "SWIM") {
    return stepPaceInputToCanonical(
      input,
      "SWIM",
      swimDistanceDisplayUnit(settings),
      settings.SWIM.poolSize
    );
  }
  return stepPaceInputToCanonical(
    input,
    "RUN",
    unitSettingsForDiscipline("RUN", settings).displayUnit,
    null
  );
}

export function hoursFromDisciplineDistance(
  discipline: "SWIM" | "RUN",
  meters: number,
  def: DisciplineRampDefaults
): number {
  return hoursFromDistancePace(discipline, meters, def.referencePaceSeconds);
}

export function disciplinePlanningMode(
  discipline: "swim" | "run",
  rampDefaults: SimpleRampDefaults
) {
  return rampDefaults[discipline].mode;
}
