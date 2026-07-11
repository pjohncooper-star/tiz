import {
  DEFAULT_REFERENCE_PACE_SECONDS,
  distanceMetersFromHoursPace,
  hoursFromDistancePace,
} from "./distance-pace-rollup";
import { roundHours } from "./volume-curve";

export type SimpleDiscipline = "swim" | "bike" | "run";
export type VolumePlanningMode = "HOURS" | "DISTANCE";

export const SIMPLE_DISCIPLINES: SimpleDiscipline[] = ["swim", "bike", "run"];

export type DisciplineRampDefaults = {
  mode: VolumePlanningMode;
  startHours: number;
  peakHours: number;
  ratePercent: number;
  startDistanceMeters: number;
  peakDistanceMeters: number;
  referencePaceSeconds: number;
};

export type SimpleRampDefaults = Record<SimpleDiscipline, DisciplineRampDefaults>;

export type SimplePhaseSpan = {
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: Record<SimpleDiscipline, boolean>;
};

export type SimpleWeekVolume = {
  weekIndex: number;
  isRestWeek: boolean;
  volumeOverridden?: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  totalHours: number;
  swimDistanceMeters?: number | null;
  runDistanceMeters?: number | null;
};

const HOURS_KEY: Record<
  SimpleDiscipline,
  "swimHours" | "bikeHours" | "runHours"
> = {
  swim: "swimHours",
  bike: "bikeHours",
  run: "runHours",
};

const DISTANCE_KEY: Partial<
  Record<SimpleDiscipline, "swimDistanceMeters" | "runDistanceMeters">
> = {
  swim: "swimDistanceMeters",
  run: "runDistanceMeters",
};

const PACE_DISCIPLINE: Partial<Record<SimpleDiscipline, "RUN" | "SWIM">> = {
  swim: "SWIM",
  run: "RUN",
};

function roundMeters(value: number): number {
  return Math.round(value);
}

function disciplineMode(
  discipline: SimpleDiscipline,
  def: DisciplineRampDefaults
): VolumePlanningMode {
  if (discipline === "bike") return "HOURS";
  return def.mode;
}

function hourRampDefaults(def: DisciplineRampDefaults): Pick<
  DisciplineRampDefaults,
  "startHours" | "peakHours" | "ratePercent"
> {
  return {
    startHours: def.startHours,
    peakHours: def.peakHours,
    ratePercent: def.ratePercent,
  };
}

function distanceRampDefaults(def: DisciplineRampDefaults): Pick<
  DisciplineRampDefaults,
  "startDistanceMeters" | "peakDistanceMeters" | "ratePercent" | "referencePaceSeconds"
> {
  return {
    startDistanceMeters: def.startDistanceMeters,
    peakDistanceMeters: def.peakDistanceMeters,
    ratePercent: def.ratePercent,
    referencePaceSeconds: def.referencePaceSeconds,
  };
}

export function rampBaseWeekIndex(
  weeks: Array<{ isRestWeek: boolean }>,
  weekIndex: number
): number {
  let j = weekIndex - 1;
  while (j >= 0 && weeks[j]!.isRestWeek) {
    j -= 1;
  }
  return j;
}

export function phaseForWeek(
  phases: SimplePhaseSpan[],
  weekIndex: number
): SimplePhaseSpan | null {
  for (const phase of phases) {
    if (weekIndex >= phase.startWeekIndex && weekIndex <= phase.endWeekIndex) {
      return phase;
    }
  }
  return null;
}

export function isRampOnForDiscipline(
  phase: SimplePhaseSpan | null,
  discipline: SimpleDiscipline
): boolean {
  if (!phase) return true;
  return phase.rampEnabled[discipline];
}

export function sumWeekHours(week: Pick<SimpleWeekVolume, "swimHours" | "bikeHours" | "runHours">): number {
  return roundHours(week.swimHours + week.bikeHours + week.runHours);
}

function rampNumericValue(
  weeks: SimpleWeekVolume[],
  weekIndex: number,
  phases: SimplePhaseSpan[],
  discipline: SimpleDiscipline,
  readValue: (week: SimpleWeekVolume) => number,
  writeValue: (week: SimpleWeekVolume, value: number) => void,
  startValue: number,
  peakValue: number,
  ratePercent: number
): void {
  const week = weeks[weekIndex]!;
  const phase = phaseForWeek(phases, weekIndex);

  if (week.isRestWeek || week.volumeOverridden) return;
  if (!isRampOnForDiscipline(phase, discipline)) return;

  const baseIndex = rampBaseWeekIndex(weeks, weekIndex);
  if (baseIndex < 0) {
    writeValue(week, startValue);
    return;
  }

  const base = readValue(weeks[baseIndex]!);
  const rate = ratePercent / 100;
  writeValue(week, Math.min(base * (1 + rate), peakValue));
}

function applyHourRamp(
  weeks: SimpleWeekVolume[],
  phases: SimplePhaseSpan[],
  discipline: SimpleDiscipline,
  def: Pick<DisciplineRampDefaults, "startHours" | "peakHours" | "ratePercent">
): void {
  const hoursKey = HOURS_KEY[discipline];
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    rampNumericValue(
      weeks,
      weekIndex,
      phases,
      discipline,
      (week) => week[hoursKey],
      (week, value) => {
        week[hoursKey] = roundHours(value);
      },
      def.startHours,
      def.peakHours,
      def.ratePercent
    );
  }
}

function applyDistanceRamp(
  weeks: SimpleWeekVolume[],
  phases: SimplePhaseSpan[],
  discipline: SimpleDiscipline,
  def: Pick<
    DisciplineRampDefaults,
    "startDistanceMeters" | "peakDistanceMeters" | "ratePercent" | "referencePaceSeconds"
  >
): void {
  const distanceKey = DISTANCE_KEY[discipline];
  const hoursKey = HOURS_KEY[discipline];
  const paceDiscipline = PACE_DISCIPLINE[discipline];
  if (!distanceKey || !paceDiscipline) return;

  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    rampNumericValue(
      weeks,
      weekIndex,
      phases,
      discipline,
      (week) => week[distanceKey] ?? def.startDistanceMeters,
      (week, value) => {
        const meters = roundMeters(value);
        week[distanceKey] = meters;
        week[hoursKey] = hoursFromDistancePace(
          paceDiscipline,
          meters,
          def.referencePaceSeconds
        );
      },
      def.startDistanceMeters,
      def.peakDistanceMeters,
      def.ratePercent
    );
  }
}

export function syncDerivedDistanceOrHours(
  weeks: SimpleWeekVolume[],
  defaults: SimpleRampDefaults
): void {
  for (const discipline of ["swim", "run"] as const) {
    const def = defaults[discipline];
    const mode = disciplineMode(discipline, def);
    const distanceKey = DISTANCE_KEY[discipline]!;
    const hoursKey = HOURS_KEY[discipline];
    const paceDiscipline = PACE_DISCIPLINE[discipline]!;

    for (const week of weeks) {
      if (mode === "DISTANCE") {
        const meters = week[distanceKey];
        if (meters != null && meters > 0) {
          week[hoursKey] = hoursFromDistancePace(
            paceDiscipline,
            meters,
            def.referencePaceSeconds
          );
        }
      } else if (def.referencePaceSeconds > 0) {
        week[distanceKey] = roundMeters(
          distanceMetersFromHoursPace(
            paceDiscipline,
            week[hoursKey],
            def.referencePaceSeconds
          )
        );
      }
    }
  }
}

export function recalculateSimpleVolumes(
  weeks: SimpleWeekVolume[],
  phases: SimplePhaseSpan[],
  defaults: SimpleRampDefaults
): SimpleWeekVolume[] {
  const result = weeks.map((week) => ({ ...week }));

  for (const discipline of SIMPLE_DISCIPLINES) {
    const def = defaults[discipline];
    if (disciplineMode(discipline, def) === "DISTANCE") {
      applyDistanceRamp(result, phases, discipline, distanceRampDefaults(def));
    } else {
      applyHourRamp(result, phases, discipline, hourRampDefaults(def));
    }
  }

  syncDerivedDistanceOrHours(result, defaults);

  for (const week of result) {
    week.totalHours = sumWeekHours(week);
  }

  return result;
}

export function buildDisciplineRampDefaults(input: {
  mode?: VolumePlanningMode | null;
  startHours: number;
  peakHours: number;
  ratePercent: number;
  startDistanceMeters?: number | null;
  peakDistanceMeters?: number | null;
  referencePaceSeconds?: number | null;
  paceDiscipline?: "RUN" | "SWIM";
}): DisciplineRampDefaults {
  const mode = input.mode ?? "HOURS";
  const paceDiscipline = input.paceDiscipline ?? "RUN";
  const referencePaceSeconds =
    input.referencePaceSeconds && input.referencePaceSeconds > 0
      ? input.referencePaceSeconds
      : DEFAULT_REFERENCE_PACE_SECONDS[paceDiscipline];

  const startDistanceMeters =
    input.startDistanceMeters && input.startDistanceMeters > 0
      ? input.startDistanceMeters
      : roundMeters(
          distanceMetersFromHoursPace(paceDiscipline, input.startHours, referencePaceSeconds)
        );
  const peakDistanceMeters =
    input.peakDistanceMeters && input.peakDistanceMeters > 0
      ? input.peakDistanceMeters
      : roundMeters(
          distanceMetersFromHoursPace(paceDiscipline, input.peakHours, referencePaceSeconds)
        );

  return {
    mode,
    startHours: input.startHours,
    peakHours: input.peakHours,
    ratePercent: input.ratePercent,
    startDistanceMeters,
    peakDistanceMeters,
    referencePaceSeconds,
  };
}

export function defaultSimpleRampDefaults(
  _startHours = 8,
  _peakHours = 16,
  ratePercent = 5
): SimpleRampDefaults {
  return {
    swim: buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 2,
      peakHours: 4,
      ratePercent,
      paceDiscipline: "SWIM",
    }),
    bike: buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 4,
      peakHours: 8,
      ratePercent,
      paceDiscipline: "RUN",
    }),
    run: buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: 2,
      peakHours: 4,
      ratePercent,
      paceDiscipline: "RUN",
    }),
  };
}

export function resolveSimpleRampDefaults(plan: {
  startHours: number;
  peakHours: number;
  maxRampPercent: number;
  swimStartHours?: number | null;
  swimPeakHours?: number | null;
  swimRampPercent?: number | null;
  bikeStartHours?: number | null;
  bikePeakHours?: number | null;
  bikeRampPercent?: number | null;
  runStartHours?: number | null;
  runPeakHours?: number | null;
  runRampPercent?: number | null;
  swimSplitPercent?: number | null;
  bikeSplitPercent?: number | null;
  runSplitPercent?: number | null;
  swimPlanningMode?: VolumePlanningMode | null;
  runPlanningMode?: VolumePlanningMode | null;
  swimReferencePaceSeconds?: number | null;
  runReferencePaceSeconds?: number | null;
  swimStartDistanceMeters?: number | null;
  swimPeakDistanceMeters?: number | null;
  runStartDistanceMeters?: number | null;
  runPeakDistanceMeters?: number | null;
}): SimpleRampDefaults {
  const fallback = defaultSimpleRampDefaults(
    plan.startHours,
    plan.peakHours,
    plan.maxRampPercent
  );

  const swimPct = plan.swimSplitPercent ?? 25;
  const bikePct = plan.bikeSplitPercent ?? 50;
  const runPct = plan.runSplitPercent ?? 25;

  return {
    swim: buildDisciplineRampDefaults({
      mode: plan.swimPlanningMode ?? "HOURS",
      startHours: plan.swimStartHours ?? roundHours(plan.startHours * (swimPct / 100)),
      peakHours: plan.swimPeakHours ?? roundHours(plan.peakHours * (swimPct / 100)),
      ratePercent: plan.swimRampPercent ?? plan.maxRampPercent,
      referencePaceSeconds: plan.swimReferencePaceSeconds,
      startDistanceMeters: plan.swimStartDistanceMeters,
      peakDistanceMeters: plan.swimPeakDistanceMeters,
      paceDiscipline: "SWIM",
    }),
    bike: buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: plan.bikeStartHours ?? roundHours(plan.startHours * (bikePct / 100)),
      peakHours: plan.bikePeakHours ?? roundHours(plan.peakHours * (bikePct / 100)),
      ratePercent: plan.bikeRampPercent ?? plan.maxRampPercent,
      paceDiscipline: "RUN",
    }),
    run: buildDisciplineRampDefaults({
      mode: plan.runPlanningMode ?? "HOURS",
      startHours: plan.runStartHours ?? roundHours(plan.startHours * (runPct / 100)),
      peakHours: plan.runPeakHours ?? roundHours(plan.peakHours * (runPct / 100)),
      ratePercent: plan.runRampPercent ?? plan.maxRampPercent,
      referencePaceSeconds: plan.runReferencePaceSeconds,
      startDistanceMeters: plan.runStartDistanceMeters,
      peakDistanceMeters: plan.runPeakDistanceMeters,
      paceDiscipline: "RUN",
    }),
  };
}

export function parseSimpleRampDefaultsFromApi(
  input: {
    swim: Partial<DisciplineRampDefaults> & {
      startHours: number;
      peakHours: number;
      ratePercent: number;
    };
    bike: Partial<DisciplineRampDefaults> & {
      startHours: number;
      peakHours: number;
      ratePercent: number;
    };
    run: Partial<DisciplineRampDefaults> & {
      startHours: number;
      peakHours: number;
      ratePercent: number;
    };
  }
): SimpleRampDefaults {
  return {
    swim: buildDisciplineRampDefaults({
      mode: input.swim.mode ?? "HOURS",
      startHours: input.swim.startHours,
      peakHours: input.swim.peakHours,
      ratePercent: input.swim.ratePercent,
      startDistanceMeters: input.swim.startDistanceMeters,
      peakDistanceMeters: input.swim.peakDistanceMeters,
      referencePaceSeconds: input.swim.referencePaceSeconds,
      paceDiscipline: "SWIM",
    }),
    bike: buildDisciplineRampDefaults({
      mode: "HOURS",
      startHours: input.bike.startHours,
      peakHours: input.bike.peakHours,
      ratePercent: input.bike.ratePercent,
      paceDiscipline: "RUN",
    }),
    run: buildDisciplineRampDefaults({
      mode: input.run.mode ?? "HOURS",
      startHours: input.run.startHours,
      peakHours: input.run.peakHours,
      ratePercent: input.run.ratePercent,
      startDistanceMeters: input.run.startDistanceMeters,
      peakDistanceMeters: input.run.peakDistanceMeters,
      referencePaceSeconds: input.run.referencePaceSeconds,
      paceDiscipline: "RUN",
    }),
  };
}

export function rampDefaultsToPlanFields(defaults: SimpleRampDefaults) {
  const totalStart = roundHours(
    defaults.swim.startHours + defaults.bike.startHours + defaults.run.startHours
  );
  const totalPeak = roundHours(
    defaults.swim.peakHours + defaults.bike.peakHours + defaults.run.peakHours
  );
  return {
    startHours: totalStart,
    peakHours: totalPeak,
    maxRampPercent: defaults.bike.ratePercent,
    swimStartHours: defaults.swim.startHours,
    swimPeakHours: defaults.swim.peakHours,
    swimRampPercent: defaults.swim.ratePercent,
    bikeStartHours: defaults.bike.startHours,
    bikePeakHours: defaults.bike.peakHours,
    bikeRampPercent: defaults.bike.ratePercent,
    runStartHours: defaults.run.startHours,
    runPeakHours: defaults.run.peakHours,
    runRampPercent: defaults.run.ratePercent,
    swimPlanningMode: defaults.swim.mode,
    runPlanningMode: defaults.run.mode,
    swimReferencePaceSeconds: defaults.swim.referencePaceSeconds,
    runReferencePaceSeconds: defaults.run.referencePaceSeconds,
    swimStartDistanceMeters: defaults.swim.startDistanceMeters,
    swimPeakDistanceMeters: defaults.swim.peakDistanceMeters,
    runStartDistanceMeters: defaults.run.startDistanceMeters,
    runPeakDistanceMeters: defaults.run.peakDistanceMeters,
  };
}

export function phasesFromWeekCounts(
  phases: {
    startWeekIndex: number;
    endWeekIndex: number;
    rampEnabled: Record<SimpleDiscipline, boolean>;
  }[]
): SimplePhaseSpan[] {
  return phases.map((phase) => ({
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    rampEnabled: phase.rampEnabled,
  }));
}

export function buildPhaseSpansFromDb(
  phases: {
    sortOrder: number;
    weekCount: number;
    rampSwimEnabled: boolean;
    rampBikeEnabled: boolean;
    rampRunEnabled: boolean;
  }[]
): SimplePhaseSpan[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor = 0;
  return sorted.map((phase) => {
    const startWeekIndex = cursor;
    const endWeekIndex = cursor + Math.max(phase.weekCount, 1) - 1;
    cursor += phase.weekCount;
    return {
      startWeekIndex,
      endWeekIndex,
      rampEnabled: {
        swim: phase.rampSwimEnabled,
        bike: phase.rampBikeEnabled,
        run: phase.rampRunEnabled,
      },
    };
  });
}
