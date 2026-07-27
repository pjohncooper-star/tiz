import type { PlanningMode, VolumeProgressionMode } from "@prisma/client";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import { isAssignedPhase } from "./phase-span-utils";
import { phaseHasVolumeConfig, type PhaseVolumeSpan } from "./simple-phase-volume";
import type { SimpleRampDefaults } from "./simple-ramp";
import { roundHours } from "./volume-curve";

function toSpan(phase: SimplePhase): PhaseVolumeSpan {
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
  };
}

/**
 * When phases lack volume config, seed them from season ramp defaults as
 * PERCENT progression so the season ramp triad can be deprecated in the UI.
 */
export function migrateSeasonRampDefaultsOntoPhases(
  phases: SimplePhase[],
  rampDefaults: SimpleRampDefaults,
  planningMode: PlanningMode = "BY_DISCIPLINE"
): { phases: SimplePhase[]; migrated: boolean } {
  const assigned = phases.filter(isAssignedPhase);
  if (assigned.length === 0) {
    return { phases, migrated: false };
  }
  if (assigned.some((phase) => phaseHasVolumeConfig(toSpan(phase)))) {
    return { phases, migrated: false };
  }

  const sorted = [...assigned].sort((a, b) => a.startWeekIndex - b.startWeekIndex);
  const firstId = sorted[0]!.id ?? sorted[0]!.name;
  const overall = planningMode === "OVERALL";

  const next = phases.map((phase) => {
    if (!isAssignedPhase(phase)) return phase;
    const isFirst = (phase.id ?? phase.name) === firstId;
    const progressionMode: VolumeProgressionMode = "PERCENT";

    if (overall) {
      const startHours = isFirst
        ? roundHours(
            rampDefaults.swim.startHours +
              rampDefaults.bike.startHours +
              rampDefaults.run.startHours
          )
        : null;
      const endHours = roundHours(
        rampDefaults.swim.peakHours +
          rampDefaults.bike.peakHours +
          rampDefaults.run.peakHours
      );
      const rate = Math.max(
        rampDefaults.swim.ratePercent,
        rampDefaults.bike.ratePercent,
        rampDefaults.run.ratePercent
      );
      return {
        ...phase,
        volumeProgressionMode: progressionMode,
        volumeMesocycleMode: "INCREASE" as const,
        volumeStartHours: startHours,
        volumeEndHours: endHours,
        volumeRampPercent: rate,
        volumeStepHours: null,
      };
    }

    return {
      ...phase,
      volumeProgressionMode: progressionMode,
      volumeMesocycleMode: "INCREASE" as const,
      swimStartHours: isFirst ? rampDefaults.swim.startHours : null,
      swimEndHours: rampDefaults.swim.peakHours,
      swimRampPercent: rampDefaults.swim.ratePercent,
      swimStepHours: null,
      bikeStartHours: isFirst ? rampDefaults.bike.startHours : null,
      bikeEndHours: rampDefaults.bike.peakHours,
      bikeRampPercent: rampDefaults.bike.ratePercent,
      bikeStepHours: null,
      runStartHours: isFirst ? rampDefaults.run.startHours : null,
      runEndHours: rampDefaults.run.peakHours,
      runRampPercent: rampDefaults.run.ratePercent,
      runStepHours: null,
    };
  });

  return { phases: next, migrated: true };
}
