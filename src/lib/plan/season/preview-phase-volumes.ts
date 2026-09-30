import type { PlanningMode } from "@prisma/client";
import type { SimplePhase, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import type { SessionFormulaCatalog } from "./base-formulas";
import {
  mixItemsForTemplate,
  type FormulaTemplateItem,
} from "@/lib/plan/calendar/template-formula-shape";
import { migrateSeasonRampDefaultsOntoPhases } from "./migrate-season-ramp-to-phases";
import { isAssignedPhase } from "./phase-span-utils";
import {
  recalculatePhaseAwareVolumes,
  type PhaseVolumeSpan,
} from "./simple-phase-volume";
import {
  pickPhasePlanningUnits,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
} from "./simple-ramp";
import { roundHours } from "./volume-curve";

function toPhaseVolumeSpan(
  phase: SimplePhase,
  templates?: Array<{ id: string; items?: FormulaTemplateItem[] | null }>
): PhaseVolumeSpan {
  return {
    id: phase.id,
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    planningMode: phase.planningMode ?? null,
    phaseKind: phase.phaseKind,
    rampEnabled: phase.rampEnabled,
    volumeMesocycleMode: phase.volumeMesocycleMode,
    volumeProgressionMode: phase.volumeProgressionMode,
    volumeStartHours: phase.volumeStartHours,
    volumeEndHours: phase.volumeEndHours,
    volumeRampPercent: phase.volumeRampPercent,
    volumeStepHours: phase.volumeStepHours,
    swimStartHours: phase.swimStartHours,
    swimEndHours: phase.swimEndHours,
    swimRampPercent: phase.swimRampPercent,
    swimStepHours: phase.swimStepHours,
    bikeStartHours: phase.bikeStartHours,
    bikeEndHours: phase.bikeEndHours,
    bikeRampPercent: phase.bikeRampPercent,
    bikeStepHours: phase.bikeStepHours,
    runStartHours: phase.runStartHours,
    runEndHours: phase.runEndHours,
    runRampPercent: phase.runRampPercent,
    runStepHours: phase.runStepHours,
    ...pickPhasePlanningUnits(phase),
    disciplineFormulaIds: phase.disciplineFormulaIds,
    weeklyTemplateId: phase.weeklyTemplateId ?? null,
    formulaTemplateItems: mixItemsForTemplate(phase.weeklyTemplateId, templates),
  };
}

function toWeekVolume(week: SimpleWeek): SimpleWeekVolume {
  return {
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    totalHours: week.totalHours,
    swimDistanceMeters: week.swimDistanceMeters,
    runDistanceMeters: week.runDistanceMeters,
  };
}

/**
 * Client-safe preview of week volumes from phase progression + season units.
 * Mirrors server `recalculatePhaseAwareVolumes` inputs.
 */
export function previewPhaseAwareVolumes(input: {
  weeks: SimpleWeek[];
  phases: SimplePhase[];
  rampDefaults: SimpleRampDefaults;
  restVolumePercent: number;
  seasonDefaultPlanningMode: PlanningMode;
  preserveBikeHours?: boolean;
  formulaCatalog?: SessionFormulaCatalog;
  templates?: Array<{ id: string; items?: FormulaTemplateItem[] | null }>;
}): { weeks: SimpleWeek[]; phases: SimplePhase[]; migrated: boolean } {
  const planningMode = input.seasonDefaultPlanningMode ?? "BY_DISCIPLINE";
  const { phases, migrated } = migrateSeasonRampDefaultsOntoPhases(
    input.phases,
    input.rampDefaults,
    planningMode
  );

  const assigned = phases.filter(isAssignedPhase);
  const volumeWeeks = recalculatePhaseAwareVolumes({
    weeks: input.weeks.map(toWeekVolume),
    phases: assigned.map((phase) => toPhaseVolumeSpan(phase, input.templates)),
    rampPhaseSpans: assigned.map((phase) => ({
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      rampEnabled: phase.rampEnabled,
    })),
    defaults: input.rampDefaults,
    restVolumePercent: input.restVolumePercent,
    seasonDefaultPlanningMode: planningMode,
    seasonAnchors: {
      startHours: roundHours(
        input.rampDefaults.swim.startHours +
          input.rampDefaults.bike.startHours +
          input.rampDefaults.run.startHours
      ),
      peakHours: roundHours(
        input.rampDefaults.swim.peakHours +
          input.rampDefaults.bike.peakHours +
          input.rampDefaults.run.peakHours
      ),
    },
    seasonSplit: {
      swim: 25,
      bike: 50,
      run: 25,
    },
    formulaCatalog: input.formulaCatalog,
  });

  const byIndex = new Map(volumeWeeks.map((week) => [week.weekIndex, week]));
  const weeks = input.weeks.map((week) => {
    const next = byIndex.get(week.weekIndex);
    if (!next) return week;
    const bikeHours = input.preserveBikeHours ? week.bikeHours : next.bikeHours;
    return {
      ...week,
      swimHours: next.swimHours,
      bikeHours,
      runHours: next.runHours,
      totalHours: roundHours(
        next.swimHours + bikeHours + next.runHours + (week.strengthHours ?? 0)
      ),
      swimDistanceMeters: next.swimDistanceMeters,
      runDistanceMeters: next.runDistanceMeters,
    };
  });

  return { weeks, phases, migrated };
}
