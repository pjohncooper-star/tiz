import type { Discipline } from "@/components/season/season-settings-types";
import type { PlanDiscipline } from "@/lib/plan/session";
import { formatSummaryDistance } from "@/lib/plan/calendar/week-summary";
import {
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  reportingDistanceInputLabel,
  reportingDistanceInputToMeters,
  reportingDistanceMetersToInput,
} from "@/lib/workout/metrics";

const DISTANCE_UNIT_PRIORITY: Discipline[] = ["RUN", "BIKE", "SWIM"];

/** Which sport's distance unit applies to the single optional race distance field. */
export function goalRaceDistanceDiscipline(disciplines: Discipline[]): PlanDiscipline {
  if (disciplines.length === 1) {
    return disciplines[0] as PlanDiscipline;
  }
  for (const discipline of DISTANCE_UNIT_PRIORITY) {
    if (disciplines.includes(discipline)) {
      return discipline as PlanDiscipline;
    }
  }
  return "RUN";
}

export function goalRaceDistanceDisplayUnit(
  disciplines: Discipline[],
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): DisplayUnit {
  const discipline = goalRaceDistanceDiscipline(disciplines);
  if (discipline === "SWIM") {
    return swimDisplayUnit(settings.SWIM.poolSize);
  }
  return unitSettingsForDiscipline(discipline, settings).displayUnit;
}

export function goalRaceDistanceInputLabel(
  disciplines: Discipline[],
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  const discipline = goalRaceDistanceDiscipline(disciplines);
  const displayUnit = goalRaceDistanceDisplayUnit(disciplines, settings);
  return reportingDistanceInputLabel(discipline, displayUnit);
}

export function goalRaceDistanceMetersToInput(
  meters: number | null | undefined,
  disciplines: Discipline[],
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  const discipline = goalRaceDistanceDiscipline(disciplines);
  const displayUnit = goalRaceDistanceDisplayUnit(disciplines, settings);
  return reportingDistanceMetersToInput(meters, discipline, displayUnit);
}

export function goalRaceDistanceInputToMeters(
  input: string,
  disciplines: Discipline[],
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): number | null {
  const discipline = goalRaceDistanceDiscipline(disciplines);
  const displayUnit = goalRaceDistanceDisplayUnit(disciplines, settings);
  return reportingDistanceInputToMeters(input, discipline, displayUnit);
}

export function formatGoalRaceDistance(
  meters: number | null | undefined,
  disciplines: Discipline[],
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string | null {
  if (meters == null || meters <= 0) return null;
  const discipline = goalRaceDistanceDiscipline(disciplines);
  return formatSummaryDistance(discipline, meters, settings);
}
