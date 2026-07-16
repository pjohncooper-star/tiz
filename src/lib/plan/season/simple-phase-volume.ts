import type { PhaseKind, PlanningMode, VolumeMesocycleMode } from "@prisma/client";
import {
  TAPER_VOLUME_END_FACTOR,
  TAPER_VOLUME_START_FACTOR,
} from "./constants";
import {
  resolveDisciplineTargets,
  type DisciplineKey,
} from "./discipline-volume-ramp";
import { resolvePlanningModeForWeek, type PhasePlanningSpan } from "./planning-mode";
import {
  resolvePhaseTargets,
  type SeasonVolumeAnchors,
} from "./phase-volume-ramp";
import type { SeasonPhaseInput } from "./types";
import {
  type SimpleDiscipline,
  type SimplePhaseSpan,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
  SIMPLE_DISCIPLINES,
  isRampOnForDiscipline,
  sumWeekHours,
  syncDerivedDistanceOrHours,
  applyRestVolumeCuts,
  recalculateSimpleVolumes,
} from "./simple-ramp";
import { roundHours } from "./volume-curve";

export type PhaseVolumeSpan = PhasePlanningSpan & {
  id?: string;
  phaseKind: PhaseKind;
  rampEnabled: Record<SimpleDiscipline, boolean>;
  volumeMesocycleMode?: VolumeMesocycleMode | null;
  volumeStartHours?: number | null;
  volumeEndHours?: number | null;
  volumeRampPercent?: number | null;
  swimStartHours?: number | null;
  swimEndHours?: number | null;
  swimRampPercent?: number | null;
  bikeStartHours?: number | null;
  bikeEndHours?: number | null;
  bikeRampPercent?: number | null;
  runStartHours?: number | null;
  runEndHours?: number | null;
  runRampPercent?: number | null;
};

const DISCIPLINE_KEYS: DisciplineKey[] = ["swim", "bike", "run"];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function taperFactor(weekIndexInTaper: number, taperWeekCount: number): number {
  if (taperWeekCount <= 1) return TAPER_VOLUME_START_FACTOR;
  const t = weekIndexInTaper / (taperWeekCount - 1);
  return lerp(TAPER_VOLUME_START_FACTOR, TAPER_VOLUME_END_FACTOR, t);
}

export function phaseHasVolumeConfig(phase: PhaseVolumeSpan): boolean {
  return (
    phase.volumeStartHours != null ||
    phase.volumeEndHours != null ||
    phase.volumeRampPercent != null ||
    phase.swimStartHours != null ||
    phase.swimEndHours != null ||
    phase.swimRampPercent != null ||
    phase.bikeStartHours != null ||
    phase.bikeEndHours != null ||
    phase.bikeRampPercent != null ||
    phase.runStartHours != null ||
    phase.runEndHours != null ||
    phase.runRampPercent != null
  );
}

export function planUsesPhaseVolumeRamps(phases: PhaseVolumeSpan[]): boolean {
  return phases.some(phaseHasVolumeConfig);
}

function sortedPhases(phases: PhaseVolumeSpan[]): PhaseVolumeSpan[] {
  return [...phases]
    .filter((p) => p.startWeekIndex >= 0 && p.endWeekIndex >= p.startWeekIndex)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);
}

function toSeasonPhaseInput(phase: PhaseVolumeSpan, sortOrder: number): SeasonPhaseInput {
  return {
    id: phase.id,
    name: "",
    sortOrder,
    weekCount: phase.endWeekIndex - phase.startWeekIndex + 1,
    phaseKind: phase.phaseKind,
    focusMode: "PHASE",
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
    volumeMesocycleMode: phase.volumeMesocycleMode ?? undefined,
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

function phaseAtWeek(
  phases: PhaseVolumeSpan[],
  weekIndex: number
): PhaseVolumeSpan | null {
  return (
    phases.find(
      (p) =>
        weekIndex >= p.startWeekIndex &&
        weekIndex <= p.endWeekIndex
    ) ?? null
  );
}

function nonRestProgressT(
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number
): number {
  const phaseWeeks = weeks.filter(
    (w) =>
      w.weekIndex >= phase.startWeekIndex && w.weekIndex <= phase.endWeekIndex
  );
  const nonRest = phaseWeeks.filter((w) => !w.isRestWeek);
  if (nonRest.length <= 1) return 1;
  const progressIndex = nonRest.findIndex((w) => w.weekIndex === weekIndex);
  if (progressIndex < 0) return 0;
  return progressIndex / (nonRest.length - 1);
}

export function linearVolumeAtWeek(
  entry: number,
  exit: number,
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number,
  rampOn: boolean
): number {
  if (!rampOn) return roundHours(exit);
  const t = nonRestProgressT(weeks, phase, weekIndex);
  return roundHours(lerp(entry, exit, t));
}

function applySeasonSplitHours(
  totalHours: number,
  swimPct: number,
  bikePct: number,
  runPct: number
): Pick<SimpleWeekVolume, "swimHours" | "bikeHours" | "runHours" | "totalHours"> {
  const sum = swimPct + bikePct + runPct || 100;
  const swimHours = roundHours((totalHours * swimPct) / sum);
  const bikeHours = roundHours((totalHours * bikePct) / sum);
  const runHours = roundHours((totalHours * runPct) / sum);
  return {
    swimHours,
    bikeHours,
    runHours,
    totalHours: roundHours(swimHours + bikeHours + runHours),
  };
}

function findTotalTargets(
  resolved: ReturnType<typeof resolvePhaseTargets>,
  weekIndex: number
) {
  return resolved.find(
    (t) => weekIndex >= t.weekStart && weekIndex < t.weekEnd
  );
}

function findDisciplineTargets(
  resolved: ReturnType<typeof resolveDisciplineTargets>,
  weekIndex: number
) {
  return resolved.find(
    (t) => weekIndex >= t.weekStart && weekIndex < t.weekEnd
  );
}

function lastRampExitTotal(resolved: ReturnType<typeof resolvePhaseTargets>): number {
  return resolved[resolved.length - 1]?.volumeExit ?? 0;
}

function lastRampExitDiscipline(
  resolved: ReturnType<typeof resolveDisciplineTargets>
): number {
  return resolved[resolved.length - 1]?.exit ?? 0;
}

export function recalculatePhaseAwareVolumes(input: {
  weeks: SimpleWeekVolume[];
  phases: PhaseVolumeSpan[];
  rampPhaseSpans: SimplePhaseSpan[];
  defaults: SimpleRampDefaults;
  restVolumePercent: number;
  seasonDefaultPlanningMode: PlanningMode;
  seasonAnchors: { startHours: number; peakHours: number };
  seasonSplit: { swim: number; bike: number; run: number };
}): SimpleWeekVolume[] {
  const sorted = sortedPhases(input.phases);
  if (!planUsesPhaseVolumeRamps(sorted)) {
    return recalculateSimpleVolumes(
      input.weeks,
      input.rampPhaseSpans,
      input.defaults,
      input.restVolumePercent
    );
  }

  const seasonPhaseInputs = sorted.map((phase, index) =>
    toSeasonPhaseInput(phase, index)
  );
  const anchors: SeasonVolumeAnchors = {
    startHours: input.seasonAnchors.startHours,
    peakHours: input.seasonAnchors.peakHours,
    longRideStartMin: 0,
    longRidePeakMin: 0,
    longRunStartMin: 0,
    longRunPeakMin: 0,
  };
  const seasonSplitInput = {
    swimSplitPercent: input.seasonSplit.swim,
    bikeSplitPercent: input.seasonSplit.bike,
    runSplitPercent: input.seasonSplit.run,
  };

  const totalTargets = resolvePhaseTargets(seasonPhaseInputs, anchors);
  const disciplineTargets = Object.fromEntries(
    DISCIPLINE_KEYS.map((discipline) => [
      discipline,
      resolveDisciplineTargets(
        seasonPhaseInputs,
        anchors,
        discipline,
        seasonSplitInput
      ),
    ])
  ) as Record<DisciplineKey, ReturnType<typeof resolveDisciplineTargets>>;

  const taperWeekCount = sorted.filter((p) => p.phaseKind === "TAPER").reduce(
    (sum, p) => sum + (p.endWeekIndex - p.startWeekIndex + 1),
    0
  );
  let taperCounter = 0;

  const result = input.weeks.map((week) => ({ ...week }));

  for (const week of result) {
    if (week.isRestWeek) continue;

    const phase = phaseAtWeek(sorted, week.weekIndex);
    if (!phase) continue;

    const mode = resolvePlanningModeForWeek(
      week.weekIndex,
      sorted,
      input.seasonDefaultPlanningMode
    );
    const rampSpan: SimplePhaseSpan = {
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      rampEnabled: phase.rampEnabled,
    };

    if (phase.phaseKind === "TAPER") {
      const baseTotal = lastRampExitTotal(totalTargets);
      const factor = taperFactor(taperCounter, taperWeekCount);
      taperCounter += 1;
      const totalHours = roundHours(baseTotal * factor);
      if (mode === "OVERALL") {
        Object.assign(
          week,
          applySeasonSplitHours(
            totalHours,
            input.seasonSplit.swim,
            input.seasonSplit.bike,
            input.seasonSplit.run
          )
        );
      } else {
        for (const discipline of SIMPLE_DISCIPLINES) {
          const exit = lastRampExitDiscipline(disciplineTargets[discipline]);
          week[`${discipline}Hours`] = roundHours(exit * factor);
        }
        week.totalHours = sumWeekHours(week);
      }
      continue;
    }

    if (mode === "OVERALL") {
      const targets = findTotalTargets(totalTargets, week.weekIndex);
      if (!targets) continue;
      const totalHours = linearVolumeAtWeek(
        targets.volumeEntry,
        targets.volumeExit,
        result,
        phase,
        week.weekIndex,
        true
      );
      Object.assign(
        week,
        applySeasonSplitHours(
          totalHours,
          input.seasonSplit.swim,
          input.seasonSplit.bike,
          input.seasonSplit.run
        )
      );
      continue;
    }

    for (const discipline of SIMPLE_DISCIPLINES) {
      const targets = findDisciplineTargets(
        disciplineTargets[discipline],
        week.weekIndex
      );
      if (!targets) continue;
      const value = linearVolumeAtWeek(
        targets.entry,
        targets.exit,
        result,
        phase,
        week.weekIndex,
        isRampOnForDiscipline(rampSpan, discipline)
      );
      if (discipline === "swim") week.swimHours = value;
      else if (discipline === "bike") week.bikeHours = value;
      else week.runHours = value;
    }
    week.totalHours = sumWeekHours(week);
  }

  applyRestVolumeCuts(result, input.defaults, input.restVolumePercent);
  syncDerivedDistanceOrHours(result, input.defaults);

  for (const week of result) {
    week.totalHours = sumWeekHours(week);
  }

  return result;
}
