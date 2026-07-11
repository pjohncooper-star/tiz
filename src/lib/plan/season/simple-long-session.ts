import type { PhaseKind } from "@prisma/client";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import { phaseForWeekIndex } from "@/lib/plan/season/phase-span-utils";
import { computeLongSessionsForWeek } from "./long-session-ramp";
import { applyLongSessionTier } from "./long-session-schedule";
import {
  inferPhaseKindFromVolumeSettings,
  resolvePhaseVolumeSettings,
  volumeMesocycleModeToDb,
  type LongSessionCadence,
  type PhaseVolumeSettings,
} from "./phase-volume-settings";
import type { SimpleRampDefaults } from "./simple-ramp";
import { rampDefaultsToPlanFields } from "./simple-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

export type SimpleLongSessionDefaults = {
  longRideStartMin: number;
  longRidePeakMin: number;
  longRunStartMin: number;
  longRunPeakMin: number;
};

export const DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS: SimpleLongSessionDefaults = {
  longRideStartMin: 60,
  longRidePeakMin: 180,
  longRunStartMin: 30,
  longRunPeakMin: 90,
};

export function resolveSimpleLongSessionDefaults(plan: {
  longRideStartMin?: number | null;
  longRidePeakMin?: number | null;
  longRunStartMin?: number | null;
  longRunPeakMin?: number | null;
}): SimpleLongSessionDefaults {
  return {
    longRideStartMin: plan.longRideStartMin ?? DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS.longRideStartMin,
    longRidePeakMin: plan.longRidePeakMin ?? DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS.longRidePeakMin,
    longRunStartMin: plan.longRunStartMin ?? DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS.longRunStartMin,
    longRunPeakMin: plan.longRunPeakMin ?? DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS.longRunPeakMin,
  };
}

export function phaseVolumeSettingsForSimplePhase(phase: SimplePhase): PhaseVolumeSettings {
  return resolvePhaseVolumeSettings({
    volumeTrend: phase.volumeTrend,
    volumeTargetPercent: phase.volumeTargetPercent,
    volumeTaperStartPercent: phase.volumeTaperStartPercent,
    volumeTaperEndPercent: phase.volumeTaperEndPercent,
    longSessionCadence: phase.longSessionCadence,
    suppressRecovery: phase.suppressRecovery,
    name: phase.name,
  });
}

export function simplePhasesToSeasonPhaseInput(
  phases: SimplePhase[],
  peakHours: number
): SeasonPhaseInput[] {
  return [...phases]
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex)
    .map((phase, sortOrder) => {
      const volume = phaseVolumeSettingsForSimplePhase(phase);
      const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
      const volumeEndHours =
        volume.volumeTrend === "TAPER"
          ? peakHours * (volume.volumeTaperEndPercent / 100)
          : peakHours * (volume.volumeTargetPercent / 100);

      return {
        id: phase.id,
        name: phase.name,
        sortOrder,
        weekCount,
        phaseKind: inferPhaseKindFromVolumeSettings(volume),
        color: phase.color,
        focusMode: "PHASE",
        phaseFocus: "AEROBIC_BASE",
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        volumeMesocycleMode: volumeMesocycleModeToDb(volume.volumeTrend),
        volumeEndHours,
      };
    });
}

export function syntheticMesocyclesFromSimplePhases(phases: SimplePhase[]): ComputedMesocycle[] {
  return [...phases]
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex)
    .map((phase, phaseIndex) => ({
      phaseIndex,
      name: phase.name,
      index: 0,
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
    }));
}

export function phaseKindsByWeekFromSimplePhases(
  phases: SimplePhase[],
  totalWeeks: number
): PhaseKind[] {
  return Array.from({ length: totalWeeks }, (_, weekIndex) => {
    const phase = phaseForWeekIndex(phases, weekIndex);
    if (!phase) return "BASE" as PhaseKind;
    return inferPhaseKindFromVolumeSettings(phaseVolumeSettingsForSimplePhase(phase));
  });
}

export function isLongSessionDisabledForPhase(settings: PhaseVolumeSettings): boolean {
  return settings.volumeTrend === "TAPER" || settings.longSessionCadence === "NONE";
}

export function isFullLongWeekForSimplePhase(input: {
  weekIndex: number;
  phase: SimplePhase;
  isRestWeek: boolean;
}): boolean {
  const settings = phaseVolumeSettingsForSimplePhase(input.phase);
  if (isLongSessionDisabledForPhase(settings)) return false;
  if (input.isRestWeek) return false;

  const weekInPhase = input.weekIndex - input.phase.startWeekIndex;
  if (settings.longSessionCadence === "EVERY_WEEK") return true;
  if (settings.longSessionCadence === "EVERY_OTHER") return weekInPhase % 2 === 0;
  return false;
}

export function longWeekFlagsFromSimplePhases(
  phases: SimplePhase[],
  weeks: Array<{ weekIndex: number; isRestWeek: boolean }>
): { longRideWeekFlags: boolean[]; longRunWeekFlags: boolean[] } {
  const totalWeeks = weeks.length;
  const longRideWeekFlags = Array.from({ length: totalWeeks }, () => false);
  const longRunWeekFlags = Array.from({ length: totalWeeks }, () => false);

  for (const week of weeks) {
    const phase = phaseForWeekIndex(phases, week.weekIndex);
    if (!phase) continue;
    const isFull = isFullLongWeekForSimplePhase({
      weekIndex: week.weekIndex,
      phase,
      isRestWeek: week.isRestWeek,
    });
    longRideWeekFlags[week.weekIndex] = isFull;
    longRunWeekFlags[week.weekIndex] = isFull;
  }

  return { longRideWeekFlags, longRunWeekFlags };
}

export function recalculateSimpleLongSessions(input: {
  weeks: Array<{ weekIndex: number; isRestWeek: boolean }>;
  phases: SimplePhase[];
  longDefaults: SimpleLongSessionDefaults;
  rampDefaults: SimpleRampDefaults;
}): Array<{ longRideMinutes: number; longRunMinutes: number }> {
  const { weeks, phases, longDefaults, rampDefaults } = input;
  const totalWeeks = weeks.length;
  if (totalWeeks === 0 || phases.length === 0) {
    return [];
  }

  const rampFields = rampDefaultsToPlanFields(rampDefaults);
  const seasonPhases = simplePhasesToSeasonPhaseInput(phases, rampFields.peakHours);
  const mesocycles = syntheticMesocyclesFromSimplePhases(phases);
  const phaseKindsByWeek = phaseKindsByWeekFromSimplePhases(phases, totalWeeks);

  return weeks.map((week) => {
    const phase = phaseForWeekIndex(phases, week.weekIndex);
    if (!phase) {
      return { longRideMinutes: 0, longRunMinutes: 0 };
    }

    const settings = phaseVolumeSettingsForSimplePhase(phase);
    if (isLongSessionDisabledForPhase(settings)) {
      return { longRideMinutes: 0, longRunMinutes: 0 };
    }

    const full = computeLongSessionsForWeek(
      week.weekIndex,
      phaseKindsByWeek,
      seasonPhases,
      mesocycles,
      { startHours: rampFields.startHours, peakHours: rampFields.peakHours },
      { startMin: longDefaults.longRideStartMin, peakMin: longDefaults.longRidePeakMin },
      { startMin: longDefaults.longRunStartMin, peakMin: longDefaults.longRunPeakMin }
    );

    const isFull = isFullLongWeekForSimplePhase({
      weekIndex: week.weekIndex,
      phase,
      isRestWeek: week.isRestWeek,
    });

    return {
      longRideMinutes: applyLongSessionTier(full.longRideMinutes, isFull),
      longRunMinutes: applyLongSessionTier(full.longRunMinutes, isFull),
    };
  });
}

export function cadenceLabel(cadence: LongSessionCadence): string {
  switch (cadence) {
    case "EVERY_WEEK":
      return "Every week";
    case "EVERY_OTHER":
      return "Every other week";
    case "NONE":
      return "None";
  }
}
