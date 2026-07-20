import type { PlanningMode } from "@prisma/client";
import type { SimplePhase, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  resolveDisciplineTargets,
  type DisciplineKey,
} from "./discipline-volume-ramp";
import {
  resolvePhaseTargets,
  type SeasonVolumeAnchors,
} from "./phase-volume-ramp";
import {
  resolveEntryMeters,
  type PhaseVolumeSpan,
} from "./simple-phase-volume";
import type { SimpleRampDefaults, SimpleWeekVolume } from "./simple-ramp";
import { roundHours } from "./volume-curve";
import type { SeasonPhaseInput } from "./types";
import { isAssignedPhase } from "./phase-span-utils";

export const CHAINED_FROM_PRIOR_SUFFIX = " (chained from prior phase)";

export type ResolvedChainedStart = {
  value: number;
  fromPriorPhase: boolean;
  kind: "hours" | "meters";
};

function phaseKey(phase: SimplePhase): string {
  return phase.id ?? phase.name;
}

function sortedAssignedPhases(phases: SimplePhase[]): SimplePhase[] {
  return [...phases]
    .filter(isAssignedPhase)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);
}

function toPhaseVolumeSpan(phase: SimplePhase): PhaseVolumeSpan {
  return {
    id: phase.id,
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    planningMode: phase.planningMode ?? null,
    phaseKind: phase.phaseKind,
    rampEnabled: phase.rampEnabled,
    volumeStartHours: phase.volumeStartHours,
    volumeEndHours: phase.volumeEndHours,
    volumeRampPercent: phase.volumeRampPercent,
    swimStartHours: phase.swimStartHours,
    swimEndHours: phase.swimEndHours,
    swimRampPercent: phase.swimRampPercent,
    bikeStartHours: phase.bikeStartHours,
    bikeEndHours: phase.bikeEndHours,
    bikeRampPercent: phase.bikeRampPercent,
    runStartHours: phase.runStartHours,
    runEndHours: phase.runEndHours,
    runRampPercent: phase.runRampPercent,
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

function seasonAnchors(defaults: SimpleRampDefaults): SeasonVolumeAnchors {
  return {
    startHours: roundHours(
      defaults.swim.startHours + defaults.bike.startHours + defaults.run.startHours
    ),
    peakHours: roundHours(
      defaults.swim.peakHours + defaults.bike.peakHours + defaults.run.peakHours
    ),
    longRideStartMin: 60,
    longRidePeakMin: 180,
    longRunStartMin: 30,
    longRunPeakMin: 90,
  };
}

function toSeasonPhaseInputs(phases: SimplePhase[]): SeasonPhaseInput[] {
  return sortedAssignedPhases(phases).map((phase, sortOrder) => ({
    id: phase.id,
    name: phase.name,
    sortOrder,
    weekCount: phase.endWeekIndex - phase.startWeekIndex + 1,
    phaseKind: phase.phaseKind,
    focusMode: "PHASE",
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    volumeStartHours: phase.volumeStartHours,
    volumeEndHours: phase.volumeEndHours,
    volumeRampPercent: phase.volumeRampPercent,
    swimStartHours: phase.swimStartHours,
    swimEndHours: phase.swimEndHours,
    swimRampPercent: phase.swimRampPercent,
    bikeStartHours: phase.bikeStartHours,
    bikeEndHours: phase.bikeEndHours,
    bikeRampPercent: phase.bikeRampPercent,
    runStartHours: phase.runStartHours,
    runEndHours: phase.runEndHours,
    runRampPercent: phase.runRampPercent,
  }));
}

function priorPhaseIndex(phases: SimplePhase[], phase: SimplePhase): number {
  const sorted = sortedAssignedPhases(phases);
  return sorted.findIndex((item) => phaseKey(item) === phaseKey(phase));
}

function disciplineStartHours(
  phase: SimplePhase,
  discipline: DisciplineKey
): number | null | undefined {
  if (discipline === "swim") return phase.swimStartHours;
  if (discipline === "bike") return phase.bikeStartHours;
  return phase.runStartHours;
}

export function resolveChainedPhaseVolumeStart(input: {
  phase: SimplePhase;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  rampDefaults: SimpleRampDefaults;
  effectiveMode: PlanningMode;
  discipline?: DisciplineKey;
}): ResolvedChainedStart | null {
  const { phase, phases, weeks, rampDefaults, effectiveMode, discipline } = input;
  if (!isAssignedPhase(phase)) return null;

  const phaseIndex = priorPhaseIndex(phases, phase);
  if (phaseIndex < 0) return null;
  const fromPriorPhase = phaseIndex > 0;

  if (effectiveMode === "OVERALL") {
    if (phase.volumeStartHours != null) return null;
    const resolved = resolvePhaseTargets(toSeasonPhaseInputs(phases), seasonAnchors(rampDefaults));
    const target = resolved.find((item) => item.phaseId === phase.id);
    if (!target) return null;
    return { value: target.volumeEntry, fromPriorPhase, kind: "hours" };
  }

  if (!discipline) return null;
  if (disciplineStartHours(phase, discipline) != null) return null;

  const distanceMode =
    discipline !== "bike" && rampDefaults[discipline].mode === "DISTANCE";
  if (distanceMode) {
    const sortedSpans = sortedAssignedPhases(phases).map(toPhaseVolumeSpan);
    const weekVolumes = weeks.map(toWeekVolume);
    const span = toPhaseVolumeSpan(phase);
    const spanIndex = sortedSpans.findIndex((item) => item.id === span.id);
    const meters = resolveEntryMeters(
      discipline,
      span,
      spanIndex,
      sortedSpans,
      weekVolumes,
      rampDefaults
    );
    return { value: meters, fromPriorPhase, kind: "meters" };
  }

  const resolved = resolveDisciplineTargets(
    toSeasonPhaseInputs(phases),
    seasonAnchors(rampDefaults),
    discipline,
    {}
  );
  const target = resolved.find((item) => item.phaseId === phase.id);
  if (!target) return null;
  return { value: target.entry, fromPriorPhase, kind: "hours" };
}

export function formatChainedVolumeStartDisplay(
  storedHours: number | null | undefined,
  chained: ResolvedChainedStart | null,
  formatValue: (value: number) => string
): string {
  if (storedHours != null) return formatValue(storedHours);
  if (!chained) return "";
  const formatted = formatValue(chained.value);
  return chained.fromPriorPhase ? `${formatted}${CHAINED_FROM_PRIOR_SUFFIX}` : formatted;
}

export function stripChainedVolumeStartSuffix(raw: string): string {
  return raw.replace(/\s*\(chained from prior phase\)\s*$/i, "").trim();
}

export function resolveStoredStartAfterEdit(
  parsed: number | null,
  chained: ResolvedChainedStart | null
): number | null {
  if (parsed == null) return null;
  if (!chained) return parsed;
  const tolerance = chained.kind === "meters" ? 0.5 : 0.01;
  if (Math.abs(parsed - chained.value) <= tolerance) return null;
  return parsed;
}
