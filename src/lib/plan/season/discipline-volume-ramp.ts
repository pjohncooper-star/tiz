import type { PhaseKind, VolumeMesocycleMode } from "@prisma/client";
import {
  phaseKindDefaultSplit,
  resolveSplitForWeek,
  seasonHasCustomSplit,
  type SeasonSplitInput,
} from "./discipline-split-resolve";
import {
  RACE_PREP_VOLUME_FACTOR,
  TAPER_VOLUME_END_FACTOR,
  TAPER_VOLUME_START_FACTOR,
} from "./constants";
import {
  defaultVolumeMesocycleMode,
  mesocyclesForPhase,
  phaseIndexForWeek,
  phaseMesocyclePlateau,
  type SeasonVolumeAnchors,
  weekOffsetInPhase,
} from "./phase-volume-ramp";
import type { ComputedMesocycle, SeasonPhaseInput } from "./types";
import { roundHours } from "./volume-curve";
import { volumeEndFromStartAndRamp, weeklyCompoundVolumeAtWeek } from "./volume-ramp-triad";

export type DisciplineKey = "swim" | "bike" | "run";

const DISCIPLINE_KEYS: DisciplineKey[] = ["swim", "bike", "run"];

type DisciplineFieldMap = {
  startHours: keyof SeasonPhaseInput;
  endHours: keyof SeasonPhaseInput;
  rampPercent: keyof SeasonPhaseInput;
};

const DISCIPLINE_FIELDS: Record<DisciplineKey, DisciplineFieldMap> = {
  swim: {
    startHours: "swimStartHours",
    endHours: "swimEndHours",
    rampPercent: "swimRampPercent",
  },
  bike: {
    startHours: "bikeStartHours",
    endHours: "bikeEndHours",
    rampPercent: "bikeRampPercent",
  },
  run: {
    startHours: "runStartHours",
    endHours: "runEndHours",
    rampPercent: "runRampPercent",
  },
};

function phaseField(
  phase: SeasonPhaseInput,
  discipline: DisciplineKey,
  field: keyof DisciplineFieldMap
): number | null | undefined {
  const key = DISCIPLINE_FIELDS[discipline][field];
  return phase[key] as number | null | undefined;
}

export function disciplineHasRampConfig(
  phase: SeasonPhaseInput,
  discipline: DisciplineKey
): boolean {
  return (
    phaseField(phase, discipline, "startHours") != null ||
    phaseField(phase, discipline, "endHours") != null ||
    phaseField(phase, discipline, "rampPercent") != null
  );
}

export function phaseHasDisciplineRamp(phase: SeasonPhaseInput): boolean {
  return DISCIPLINE_KEYS.some((d) => disciplineHasRampConfig(phase, d));
}

export function planUsesDisciplineRamps(phases: SeasonPhaseInput[]): boolean {
  return phases.some(phaseHasDisciplineRamp);
}

export type ResolvedDisciplineTargets = {
  phaseIndex: number;
  phaseId?: string;
  phaseKind: PhaseKind;
  mode: VolumeMesocycleMode;
  weekStart: number;
  weekEnd: number;
  entry: number;
  exit: number;
};

function isRampPhaseKind(phaseKind: PhaseKind): boolean {
  return phaseKind !== "TAPER";
}

function defaultDisciplineExit(
  phase: SeasonPhaseInput,
  discipline: DisciplineKey,
  mode: VolumeMesocycleMode,
  anchors: SeasonVolumeAnchors,
  seasonSplit: SeasonSplitInput,
  firstRampPhaseKind: PhaseKind
): number {
  const split = seasonHasCustomSplit(seasonSplit)
    ? {
        swim: seasonSplit.swimSplitPercent ?? 0,
        bike: seasonSplit.bikeSplitPercent ?? 0,
        run:
          seasonSplit.runSplitPercent ??
          100 -
            (seasonSplit.swimSplitPercent ?? 0) -
            (seasonSplit.bikeSplitPercent ?? 0),
      }
    : phaseKindDefaultSplit(firstRampPhaseKind);

  const pct = split[discipline];
  if (phase.phaseKind === "RACE_PREP" || mode === "DECREASE") {
    return anchors.peakHours * (pct / 100) * RACE_PREP_VOLUME_FACTOR;
  }
  return anchors.peakHours * (pct / 100);
}

function resolveDisciplineExit(
  phase: SeasonPhaseInput,
  discipline: DisciplineKey,
  mode: VolumeMesocycleMode,
  entry: number,
  anchors: SeasonVolumeAnchors,
  seasonSplit: SeasonSplitInput,
  firstRampPhaseKind: PhaseKind
): number {
  const endHours = phaseField(phase, discipline, "endHours");
  if (endHours != null) return endHours;

  const rampPercent = phaseField(phase, discipline, "rampPercent");
  if (rampPercent != null && mode !== "HOLD") {
    return volumeEndFromStartAndRamp(entry, rampPercent, phase.weekCount, mode);
  }

  return defaultDisciplineExit(
    phase,
    discipline,
    mode,
    anchors,
    seasonSplit,
    firstRampPhaseKind
  );
}

export function resolveDisciplineTargets(
  phases: SeasonPhaseInput[],
  anchors: SeasonVolumeAnchors,
  discipline: DisciplineKey,
  seasonSplit: SeasonSplitInput
): ResolvedDisciplineTargets[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const firstRampPhase = sorted.find((p) => isRampPhaseKind(p.phaseKind));
  const firstRampPhaseKind = firstRampPhase?.phaseKind ?? "BASE";
  const defaultSplit = seasonHasCustomSplit(seasonSplit)
    ? {
        swim: seasonSplit.swimSplitPercent ?? 0,
        bike: seasonSplit.bikeSplitPercent ?? 0,
        run:
          seasonSplit.runSplitPercent ??
          100 -
            (seasonSplit.swimSplitPercent ?? 0) -
            (seasonSplit.bikeSplitPercent ?? 0),
      }
    : phaseKindDefaultSplit(firstRampPhaseKind);

  const result: ResolvedDisciplineTargets[] = [];
  let weekCursor = 0;
  let previousExit: number | null = null;
  let isFirstRampPhase = true;

  for (let phaseIndex = 0; phaseIndex < sorted.length; phaseIndex++) {
    const phase = sorted[phaseIndex]!;
    const weekStart = weekCursor;
    const weekEnd = weekCursor + phase.weekCount;
    weekCursor = weekEnd;

    if (!isRampPhaseKind(phase.phaseKind)) {
      continue;
    }

    const mode = phase.volumeMesocycleMode ?? defaultVolumeMesocycleMode(phase.phaseKind);
    const chainedEntry = isFirstRampPhase
      ? anchors.startHours * (defaultSplit[discipline] / 100)
      : (previousExit ?? anchors.peakHours * (defaultSplit[discipline] / 100));
    const startHours = phaseField(phase, discipline, "startHours");
    const entry = startHours ?? chainedEntry;
    const exit = resolveDisciplineExit(
      phase,
      discipline,
      mode,
      entry,
      anchors,
      seasonSplit,
      firstRampPhaseKind
    );

    result.push({
      phaseIndex,
      phaseId: phase.id,
      phaseKind: phase.phaseKind,
      mode,
      weekStart,
      weekEnd,
      entry,
      exit,
    });

    previousExit = exit;
    isFirstRampPhase = false;
  }

  return result;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function taperFactor(weekIndexInTaper: number, taperWeekCount: number): number {
  if (taperWeekCount <= 1) {
    return TAPER_VOLUME_START_FACTOR;
  }
  const t = weekIndexInTaper / (taperWeekCount - 1);
  return lerp(TAPER_VOLUME_START_FACTOR, TAPER_VOLUME_END_FACTOR, t);
}

function disciplinePlateauForWeek(
  weekIndex: number,
  phases: SeasonPhaseInput[],
  mesocycles: ComputedMesocycle[],
  resolved: ResolvedDisciplineTargets[],
  discipline: DisciplineKey
): number | null {
  const phaseIndex = phaseIndexForWeek(phases, weekIndex);
  if (phaseIndex === null) return null;

  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const phase = sorted[phaseIndex]!;
  if (!isRampPhaseKind(phase.phaseKind)) return null;

  const targets = resolved.find((t) => t.phaseIndex === phaseIndex);
  if (!targets) return null;

  const rampPercent = phaseField(phase, discipline, "rampPercent");
  if (rampPercent != null && targets.mode !== "HOLD") {
    const offset = weekOffsetInPhase(phases, weekIndex);
    if (offset != null) {
      return weeklyCompoundVolumeAtWeek(
        targets.entry,
        rampPercent,
        offset,
        targets.mode
      );
    }
  }

  const phaseMesos = mesocyclesForPhase(mesocycles, phaseIndex);
  return phaseMesocyclePlateau(
    weekIndex,
    phaseMesos,
    targets.entry,
    targets.exit,
    targets.mode
  );
}

export type DisciplineVolumeCurveInput = {
  totalWeeks: number;
  phaseKindsByWeek: PhaseKind[];
  phases: SeasonPhaseInput[];
  mesocycles: ComputedMesocycle[];
  startHours: number;
  peakHours: number;
  deLoadFlags: boolean[];
  deLoadVolumePercent: number;
  referenceWeeklyHours: number[];
  seasonSplit: SeasonSplitInput;
};

function disciplineConfigured(
  phases: SeasonPhaseInput[],
  discipline: DisciplineKey
): boolean {
  return phases.some((phase) => disciplineHasRampConfig(phase, discipline));
}

function computeSingleDisciplineCurve(
  input: DisciplineVolumeCurveInput,
  discipline: DisciplineKey
): number[] {
  const {
    totalWeeks,
    phaseKindsByWeek,
    phases,
    mesocycles,
    peakHours,
    deLoadFlags,
    deLoadVolumePercent,
    referenceWeeklyHours,
    seasonSplit,
  } = input;

  const configured = disciplineConfigured(phases, discipline);
  const anchors: SeasonVolumeAnchors = {
    startHours: input.startHours,
    peakHours,
    longRideStartMin: 0,
    longRidePeakMin: 0,
    longRunStartMin: 0,
    longRunPeakMin: 0,
  };
  const resolved = resolveDisciplineTargets(phases, anchors, discipline, seasonSplit);
  const hours: number[] = [];
  let taperCounter = 0;
  const taperWeekCount = phaseKindsByWeek.filter((k) => k === "TAPER").length;
  const lastRampExit = resolved[resolved.length - 1]?.exit ?? peakHours;

  for (let i = 0; i < totalWeeks; i++) {
    const kind = phaseKindsByWeek[i] ?? "BUILD";
    let base: number;

    if (!configured) {
      const split = resolveSplitForWeek(i, kind, mesocycles, phases, seasonSplit);
      base = referenceWeeklyHours[i]! * (split[discipline] / 100);
      hours.push(roundHours(base));
      continue;
    }

    if (kind === "TAPER") {
      base = lastRampExit * taperFactor(taperCounter, taperWeekCount);
      taperCounter += 1;
    } else {
      const plateau = disciplinePlateauForWeek(i, phases, mesocycles, resolved, discipline);
      base = plateau ?? lastRampExit;
    }

    if (deLoadFlags[i]) {
      base *= deLoadVolumePercent / 100;
    }

    hours.push(roundHours(base));
  }

  return hours;
}

export function computeWeeklyDisciplineHours(
  input: DisciplineVolumeCurveInput
): { swimHours: number[]; bikeHours: number[]; runHours: number[] } {
  return {
    swimHours: computeSingleDisciplineCurve(input, "swim"),
    bikeHours: computeSingleDisciplineCurve(input, "bike"),
    runHours: computeSingleDisciplineCurve(input, "run"),
  };
}
