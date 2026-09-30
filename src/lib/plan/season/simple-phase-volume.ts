import type {
  PhaseKind,
  PlanningMode,
  VolumeMesocycleMode,
  VolumeProgressionMode,
} from "@prisma/client";
import {
  formulaForDiscipline,
  formulaHoursAtTrainingWeek,
  type DisciplineFormulaIds,
  type FormulaDiscipline,
  type FormulaGrowthSource,
  type SessionFormulaCatalog,
} from "./base-formulas";
import {
  distanceMetersFromHoursPace,
  hoursFromDistancePace,
} from "./distance-pace-rollup";
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
  type PhasePlanningUnits,
  type SimpleDiscipline,
  type SimplePhaseSpan,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
  SIMPLE_DISCIPLINES,
  isRampOnForDiscipline,
  rampBaseWeekIndex,
  sumWeekHours,
  syncDerivedDistanceOrHours,
  applyRestVolumeCuts,
  phaseRampDefaults,
  recalculateSimpleVolumes,
  type WeekDefaultsResolver,
} from "./simple-ramp";
import { roundHours } from "./volume-curve";
import {
  inferVolumeProgressionMode,
  volumeAtProgressionWeek,
} from "./volume-progression";

export type PhaseVolumeSpan = PhasePlanningSpan & PhasePlanningUnits & {
  id?: string;
  phaseKind: PhaseKind;
  rampEnabled: Record<SimpleDiscipline, boolean>;
  volumeMesocycleMode?: VolumeMesocycleMode | null;
  volumeProgressionMode?: VolumeProgressionMode | null;
  volumeStartHours?: number | null;
  volumeEndHours?: number | null;
  volumeRampPercent?: number | null;
  volumeStepHours?: number | null;
  swimStartHours?: number | null;
  swimEndHours?: number | null;
  swimRampPercent?: number | null;
  swimStepHours?: number | null;
  bikeStartHours?: number | null;
  bikeEndHours?: number | null;
  bikeRampPercent?: number | null;
  bikeStepHours?: number | null;
  runStartHours?: number | null;
  runEndHours?: number | null;
  runRampPercent?: number | null;
  runStepHours?: number | null;
  disciplineFormulaIds?: DisciplineFormulaIds | null;
};

const DISCIPLINE_KEYS: DisciplineKey[] = ["swim", "bike", "run"];

type PaceDiscipline = "SWIM" | "RUN";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function roundMeters(value: number): number {
  return Math.round(value);
}

function taperFactor(weekIndexInTaper: number, taperWeekCount: number): number {
  if (taperWeekCount <= 1) return TAPER_VOLUME_START_FACTOR;
  const t = weekIndexInTaper / (taperWeekCount - 1);
  return lerp(TAPER_VOLUME_START_FACTOR, TAPER_VOLUME_END_FACTOR, t);
}

function paceDisciplineFor(discipline: SimpleDiscipline): PaceDiscipline | null {
  if (discipline === "swim") return "SWIM";
  if (discipline === "run") return "RUN";
  return null;
}

function isDistanceDiscipline(
  discipline: SimpleDiscipline,
  defaults: SimpleRampDefaults
): boolean {
  return discipline !== "bike" && defaults[discipline].mode === "DISTANCE";
}

function phaseStartHours(
  phase: PhaseVolumeSpan,
  discipline: SimpleDiscipline
): number | null | undefined {
  if (discipline === "swim") return phase.swimStartHours;
  if (discipline === "bike") return phase.bikeStartHours;
  return phase.runStartHours;
}

function phaseEndHours(
  phase: Pick<PhaseVolumeSpan, "swimEndHours" | "bikeEndHours" | "runEndHours">,
  discipline: SimpleDiscipline
): number | null | undefined {
  if (discipline === "swim") return phase.swimEndHours;
  if (discipline === "bike") return phase.bikeEndHours;
  return phase.runEndHours;
}

function metersFromHours(
  discipline: SimpleDiscipline,
  hours: number,
  defaults: SimpleRampDefaults
): number {
  const paceDiscipline = paceDisciplineFor(discipline);
  if (!paceDiscipline) return 0;
  return distanceMetersFromHoursPace(
    paceDiscipline,
    hours,
    defaults[discipline].referencePaceSeconds
  );
}

function weekMeters(
  week: SimpleWeekVolume,
  discipline: SimpleDiscipline,
  defaults: SimpleRampDefaults
): number {
  const paceDiscipline = paceDisciplineFor(discipline);
  if (!paceDiscipline) return 0;
  const def = defaults[discipline];
  if (discipline === "swim") {
    return (
      week.swimDistanceMeters ??
      distanceMetersFromHoursPace("SWIM", week.swimHours, def.referencePaceSeconds)
    );
  }
  return (
    week.runDistanceMeters ??
    distanceMetersFromHoursPace("RUN", week.runHours, def.referencePaceSeconds)
  );
}

function applyMetersToWeek(
  week: SimpleWeekVolume,
  discipline: SimpleDiscipline,
  meters: number,
  defaults: SimpleRampDefaults
): void {
  const paceDiscipline = paceDisciplineFor(discipline)!;
  const rounded = roundMeters(meters);
  const hours = hoursFromDistancePace(
    paceDiscipline,
    rounded,
    defaults[discipline].referencePaceSeconds
  );
  if (discipline === "swim") {
    week.swimDistanceMeters = rounded;
    week.swimHours = hours;
  } else {
    week.runDistanceMeters = rounded;
    week.runHours = hours;
  }
}

function lastNonRestWeekInPhase(
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan
): SimpleWeekVolume | null {
  const nonRest = weeks.filter(
    (w) =>
      !w.isRestWeek &&
      w.weekIndex >= phase.startWeekIndex &&
      w.weekIndex <= phase.endWeekIndex
  );
  return nonRest[nonRest.length - 1] ?? null;
}

export function resolveEntryMeters(
  discipline: SimpleDiscipline,
  phase: PhaseVolumeSpan,
  phaseIndex: number,
  sortedPhases: PhaseVolumeSpan[],
  weeks: SimpleWeekVolume[],
  seasonDefaults: SimpleRampDefaults
): number {
  const defaults = phaseRampDefaults(seasonDefaults, phase);
  const explicitStart = phaseStartHours(phase, discipline);
  if (explicitStart != null) {
    return metersFromHours(discipline, explicitStart, defaults);
  }
  if (phaseIndex > 0) {
    const priorPhase = sortedPhases[phaseIndex - 1]!;
    const lastWeek = lastNonRestWeekInPhase(weeks, priorPhase);
    if (lastWeek) {
      const priorDefaults = phaseRampDefaults(seasonDefaults, priorPhase);
      if (isDistanceDiscipline(discipline, priorDefaults)) {
        return weekMeters(lastWeek, discipline, priorDefaults);
      }
      return metersFromHours(discipline, weekHours(lastWeek, discipline), defaults);
    }
  }
  return defaults[discipline].startDistanceMeters;
}

function weekHours(week: SimpleWeekVolume, discipline: SimpleDiscipline): number {
  if (discipline === "swim") return week.swimHours;
  if (discipline === "bike") return week.bikeHours;
  return week.runHours;
}

function resolveExitMeters(
  discipline: SimpleDiscipline,
  phase: PhaseVolumeSpan,
  defaults: SimpleRampDefaults
): number {
  const explicitEnd = phaseEndHours(phase, discipline);
  if (explicitEnd != null) {
    return metersFromHours(discipline, explicitEnd, defaults);
  }
  return defaults[discipline].peakDistanceMeters;
}

export function phaseHasVolumeConfig(phase: PhaseVolumeSpan): boolean {
  return (
    phase.volumeProgressionMode != null ||
    phase.volumeStartHours != null ||
    phase.volumeEndHours != null ||
    phase.volumeRampPercent != null ||
    phase.volumeStepHours != null ||
    phase.swimStartHours != null ||
    phase.swimEndHours != null ||
    phase.swimRampPercent != null ||
    phase.swimStepHours != null ||
    phase.bikeStartHours != null ||
    phase.bikeEndHours != null ||
    phase.bikeRampPercent != null ||
    phase.bikeStepHours != null ||
    phase.runStartHours != null ||
    phase.runEndHours != null ||
    phase.runRampPercent != null ||
    phase.runStepHours != null
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
    volumeProgressionMode: phase.volumeProgressionMode ?? null,
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

function nonRestOffsetInPhase(
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number
): { offset: number; nonRestCount: number } {
  const phaseWeeks = weeks.filter(
    (w) => w.weekIndex >= phase.startWeekIndex && w.weekIndex <= phase.endWeekIndex
  );
  const nonRest = phaseWeeks.filter((w) => !w.isRestWeek);
  const offset = nonRest.findIndex((w) => w.weekIndex === weekIndex);
  return {
    offset: offset < 0 ? 0 : offset,
    nonRestCount: Math.max(nonRest.length, 1),
  };
}

function progressionModeFor(phase: PhaseVolumeSpan): VolumeProgressionMode {
  return inferVolumeProgressionMode(phase);
}

function mesocycleModeFor(phase: PhaseVolumeSpan): VolumeMesocycleMode {
  return phase.volumeMesocycleMode ?? "INCREASE";
}

function disciplineRampPercent(
  phase: Pick<PhaseVolumeSpan, "swimRampPercent" | "bikeRampPercent" | "runRampPercent">,
  discipline: SimpleDiscipline
): number | null | undefined {
  if (discipline === "swim") return phase.swimRampPercent;
  if (discipline === "bike") return phase.bikeRampPercent;
  return phase.runRampPercent;
}

function disciplineStepHours(
  phase: PhaseVolumeSpan,
  discipline: SimpleDiscipline
): number | null | undefined {
  if (discipline === "swim") return phase.swimStepHours;
  if (discipline === "bike") return phase.bikeStepHours;
  return phase.runStepHours;
}

function progressionVolumeAtWeek(
  entry: number,
  exit: number,
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number,
  rampOn: boolean,
  rampPercent?: number | null,
  stepHours?: number | null
): number {
  const { offset, nonRestCount } = nonRestOffsetInPhase(weeks, phase, weekIndex);
  return volumeAtProgressionWeek({
    entry,
    exit,
    rampPercent,
    stepHours,
    progressionMode: progressionModeFor(phase),
    mesocycleMode: mesocycleModeFor(phase),
    weekOffset: offset,
    weekCount: nonRestCount,
    rampOn,
  });
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

function phaseIndexOf(phases: PhaseVolumeSpan[], phase: PhaseVolumeSpan): number {
  return phases.findIndex(
    (p) =>
      p.startWeekIndex === phase.startWeekIndex &&
      p.endWeekIndex === phase.endWeekIndex
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

export function linearNumericAtWeek(
  entry: number,
  exit: number,
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number,
  rampOn: boolean
): number {
  if (!rampOn) return exit;
  const t = nonRestProgressT(weeks, phase, weekIndex);
  return lerp(entry, exit, t);
}

export function linearVolumeAtWeek(
  entry: number,
  exit: number,
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number,
  rampOn: boolean
): number {
  return roundHours(linearNumericAtWeek(entry, exit, weeks, phase, weekIndex, rampOn));
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
  phaseIndex: number
) {
  return resolved.find((t) => t.phaseIndex === phaseIndex);
}

function findDisciplineTargets(
  resolved: ReturnType<typeof resolveDisciplineTargets>,
  phaseIndex: number
) {
  return resolved.find((t) => t.phaseIndex === phaseIndex);
}

function lastRampExitTotal(resolved: ReturnType<typeof resolvePhaseTargets>): number {
  return resolved[resolved.length - 1]?.volumeExit ?? 0;
}

function lastRampExitDiscipline(
  resolved: ReturnType<typeof resolveDisciplineTargets>
): number {
  return resolved[resolved.length - 1]?.exit ?? 0;
}

function weekDefaultsResolver(
  sorted: PhaseVolumeSpan[],
  defaults: SimpleRampDefaults
): WeekDefaultsResolver {
  return (weekIndex) => phaseRampDefaults(defaults, phaseAtWeek(sorted, weekIndex));
}

function applyDisciplineVolume(
  week: SimpleWeekVolume,
  discipline: SimpleDiscipline,
  phase: PhaseVolumeSpan,
  sorted: PhaseVolumeSpan[],
  weeks: SimpleWeekVolume[],
  targets: { entry: number; exit: number },
  rampOn: boolean,
  defaults: SimpleRampDefaults,
  seasonDefaults: SimpleRampDefaults
): void {
  const rampPercent = disciplineRampPercent(phase, discipline) ?? phase.volumeRampPercent;
  const stepHours = disciplineStepHours(phase, discipline) ?? phase.volumeStepHours;

  if (isDistanceDiscipline(discipline, defaults)) {
    const phaseIndex = phaseIndexOf(sorted, phase);
    const entryM = resolveEntryMeters(discipline, phase, phaseIndex, sorted, weeks, seasonDefaults);
    const exitM = resolveExitMeters(discipline, phase, defaults);
    // Convert step/cap semantics: stepHours → meters via reference pace for this discipline.
    const paceDiscipline = paceDisciplineFor(discipline)!;
    const stepMeters =
      stepHours != null
        ? roundMeters(
            distanceMetersFromHoursPace(
              paceDiscipline,
              stepHours,
              defaults[discipline].referencePaceSeconds
            )
          )
        : null;
    const meters = progressionVolumeAtWeek(
      entryM,
      exitM,
      weeks,
      phase,
      week.weekIndex,
      rampOn,
      rampPercent,
      stepMeters
    );
    applyMetersToWeek(week, discipline, roundMeters(meters), defaults);
    return;
  }

  const hours = progressionVolumeAtWeek(
    targets.entry,
    targets.exit,
    weeks,
    phase,
    week.weekIndex,
    rampOn,
    rampPercent,
    stepHours
  );
  if (discipline === "swim") week.swimHours = hours;
  else if (discipline === "bike") week.bikeHours = hours;
  else week.runHours = hours;
}

function applyTaperDisciplineVolume(
  week: SimpleWeekVolume,
  discipline: SimpleDiscipline,
  factor: number,
  disciplineTargets: Record<DisciplineKey, ReturnType<typeof resolveDisciplineTargets>>,
  defaults: SimpleRampDefaults
): void {
  if (isDistanceDiscipline(discipline, defaults)) {
    const exitHours = lastRampExitDiscipline(disciplineTargets[discipline]);
    const exitM = metersFromHours(discipline, exitHours, defaults);
    applyMetersToWeek(week, discipline, exitM * factor, defaults);
    return;
  }

  const exit = lastRampExitDiscipline(disciplineTargets[discipline]);
  const hours = roundHours(exit * factor);
  if (discipline === "swim") week.swimHours = hours;
  else if (discipline === "bike") week.bikeHours = hours;
  else week.runHours = hours;
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
  formulaCatalog?: SessionFormulaCatalog;
}): SimpleWeekVolume[] {
  const sorted = sortedPhases(input.phases);
  if (!planUsesPhaseVolumeRamps(sorted)) {
    const simple = recalculateSimpleVolumes(
      input.weeks,
      input.rampPhaseSpans,
      input.defaults,
      input.restVolumePercent
    );
    applyFormulaDisciplineVolumes(simple, sorted, input);
    return simple;
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
    const phaseDefaults = phaseRampDefaults(input.defaults, phase);

    const mode = resolvePlanningModeForWeek(
      week.weekIndex,
      sorted,
      input.seasonDefaultPlanningMode
    );
    const phaseIndex = phaseIndexOf(sorted, phase);
    if (phaseIndex < 0) continue;
    const rampSpan: SimplePhaseSpan = {
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      rampEnabled: phase.rampEnabled,
    };

    if (phase.phaseKind === "TAPER") {
      const factor = taperFactor(taperCounter, taperWeekCount);
      taperCounter += 1;
      if (mode === "OVERALL") {
        const baseTotal = lastRampExitTotal(totalTargets);
        Object.assign(
          week,
          applySeasonSplitHours(
            roundHours(baseTotal * factor),
            input.seasonSplit.swim,
            input.seasonSplit.bike,
            input.seasonSplit.run
          )
        );
      } else {
        for (const discipline of SIMPLE_DISCIPLINES) {
          applyTaperDisciplineVolume(
            week,
            discipline,
            factor,
            disciplineTargets,
            phaseDefaults
          );
        }
        week.totalHours = sumWeekHours(week);
      }
      continue;
    }

    if (mode === "OVERALL") {
      const targets = findTotalTargets(totalTargets, phaseIndex);
      if (!targets) continue;
      const totalHours = progressionVolumeAtWeek(
        targets.volumeEntry,
        targets.volumeExit,
        result,
        phase,
        week.weekIndex,
        true,
        phase.volumeRampPercent,
        phase.volumeStepHours
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
        phaseIndex
      );
      if (!targets) continue;
      applyDisciplineVolume(
        week,
        discipline,
        phase,
        sorted,
        result,
        targets,
        isRampOnForDiscipline(rampSpan, discipline),
        phaseDefaults,
        input.defaults
      );
    }
    week.totalHours = sumWeekHours(week);
  }

  const defaultsForWeek = weekDefaultsResolver(sorted, input.defaults);
  applyRestVolumeCuts(result, input.defaults, input.restVolumePercent, defaultsForWeek);
  syncDerivedDistanceOrHours(result, input.defaults, defaultsForWeek);

  for (const week of result) {
    week.totalHours = sumWeekHours(week);
  }

  applyFormulaDisciplineVolumes(result, sorted, input);
  return result;
}

const FORMULA_DISCIPLINE_KEY: Record<
  SimpleDiscipline,
  FormulaDiscipline
> = {
  swim: "SWIM",
  bike: "BIKE",
  run: "RUN",
};

function formulaStartHours(
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  discipline: SimpleDiscipline
): number {
  const explicit = phaseStartHours(phase, discipline);
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  for (let index = phase.startWeekIndex - 1; index >= 0; index -= 1) {
    const prior = weeks.find((week) => week.weekIndex === index && !week.isRestWeek);
    if (!prior) continue;
    if (discipline === "swim") return prior.swimHours;
    if (discipline === "bike") return prior.bikeHours;
    return prior.runHours;
  }
  return 0;
}

function trainingWeekOffset(
  weeks: SimpleWeekVolume[],
  phase: PhaseVolumeSpan,
  weekIndex: number
): number {
  return weeks.filter(
    (week) =>
      !week.isRestWeek &&
      week.weekIndex >= phase.startWeekIndex &&
      week.weekIndex < weekIndex
  ).length;
}

function writeFormulaHours(
  week: SimpleWeekVolume,
  discipline: SimpleDiscipline,
  hours: number,
  defaults: SimpleRampDefaults
): void {
  const rounded = roundHours(Math.max(0, hours));
  if (isDistanceDiscipline(discipline, defaults)) {
    applyMetersToWeek(week, discipline, metersFromHours(discipline, rounded, defaults), defaults);
    return;
  }
  if (discipline === "swim") week.swimHours = rounded;
  else if (discipline === "bike") week.bikeHours = rounded;
  else week.runHours = rounded;
  if (discipline !== "bike") {
    const pace = defaults[discipline].referencePaceSeconds;
    if (pace > 0) {
      const meters = roundMeters(metersFromHours(discipline, rounded, defaults));
      if (discipline === "swim") week.swimDistanceMeters = meters;
      else week.runDistanceMeters = meters;
    }
  }
}

function seasonPeakHours(discipline: SimpleDiscipline, defaults: SimpleRampDefaults): number {
  const def = defaults[discipline];
  const paceDiscipline = paceDisciplineFor(discipline);
  if (
    paceDiscipline &&
    isDistanceDiscipline(discipline, defaults) &&
    def.peakDistanceMeters > 0 &&
    def.referencePaceSeconds > 0
  ) {
    return hoursFromDistancePace(paceDiscipline, def.peakDistanceMeters, def.referencePaceSeconds);
  }
  return def.peakHours;
}

export type FormulaVolumePhase = PhasePlanningUnits &
  Pick<
    PhaseVolumeSpan,
    | "volumeRampPercent"
    | "swimRampPercent"
    | "bikeRampPercent"
    | "runRampPercent"
    | "swimEndHours"
    | "bikeEndHours"
    | "runEndHours"
  >;

/** Weekly growth for a formula sport. Growth lives on the phase; empty holds volume flat. */
export function formulaPhaseRate(
  phase: FormulaVolumePhase,
  discipline: SimpleDiscipline
): { value: number; source: FormulaGrowthSource } {
  const rate = disciplineRampPercent(phase, discipline) ?? phase.volumeRampPercent;
  if (rate != null && Number.isFinite(rate)) return { value: rate, source: "phase" };
  return { value: 0, source: "none" };
}

/** Cap for a formula sport: the phase's end hours, else the season peak in the phase's units. */
export function formulaPhasePeakHours(
  phase: FormulaVolumePhase,
  discipline: SimpleDiscipline,
  seasonDefaults: SimpleRampDefaults
): { value: number; source: FormulaGrowthSource } {
  const end = phaseEndHours(phase, discipline);
  if (end != null && Number.isFinite(end)) return { value: end, source: "phase" };
  const peak = seasonPeakHours(discipline, phaseRampDefaults(seasonDefaults, phase));
  return { value: peak, source: peak > 0 ? "season" : "none" };
}

function applyFormulaDisciplineVolumes(
  weeks: SimpleWeekVolume[],
  phases: PhaseVolumeSpan[],
  input: {
    defaults: SimpleRampDefaults;
    restVolumePercent: number;
    formulaCatalog?: SessionFormulaCatalog;
  }
): void {
  const catalog = input.formulaCatalog ?? [];
  if (catalog.length === 0) return;
  const factor = input.restVolumePercent / 100;

  for (const week of weeks) {
    if (week.isRestWeek) continue;
    const phase = phaseAtWeek(phases, week.weekIndex);
    if (!phase?.disciplineFormulaIds) continue;
    const phaseDefaults = phaseRampDefaults(input.defaults, phase);
    let touched = false;
    for (const discipline of SIMPLE_DISCIPLINES) {
      const formula = formulaForDiscipline(
        catalog,
        phase.disciplineFormulaIds,
        FORMULA_DISCIPLINE_KEY[discipline]
      );
      if (!formula) continue;
      const hours = formulaHoursAtTrainingWeek({
        startHours: formulaStartHours(weeks, phase, discipline),
        ratePercent: formulaPhaseRate(phase, discipline).value,
        peakHours: formulaPhasePeakHours(phase, discipline, input.defaults).value,
        trainingWeekOffset: trainingWeekOffset(weeks, phase, week.weekIndex),
      });
      writeFormulaHours(week, discipline, hours, phaseDefaults);
      touched = true;
    }
    if (touched) week.totalHours = sumWeekHours(week);
  }

  for (const week of weeks) {
    if (!week.isRestWeek) continue;
    const phase = phaseAtWeek(phases, week.weekIndex);
    if (!phase?.disciplineFormulaIds) continue;
    const baseIndex = rampBaseWeekIndex(weeks, week.weekIndex);
    const phaseDefaults = phaseRampDefaults(input.defaults, phase);
    let touched = false;
    for (const discipline of SIMPLE_DISCIPLINES) {
      const formula = formulaForDiscipline(
        catalog,
        phase.disciplineFormulaIds,
        FORMULA_DISCIPLINE_KEY[discipline]
      );
      if (!formula) continue;
      const priorHours =
        baseIndex < 0
          ? formulaStartHours(weeks, phase, discipline)
          : discipline === "swim"
            ? weeks[baseIndex]!.swimHours
            : discipline === "bike"
              ? weeks[baseIndex]!.bikeHours
              : weeks[baseIndex]!.runHours;
      writeFormulaHours(week, discipline, priorHours * factor, phaseDefaults);
      touched = true;
    }
    if (touched) week.totalHours = sumWeekHours(week);
  }
}
