import { roundHours } from "./volume-curve";

export type SimpleDiscipline = "swim" | "bike" | "run";

export const SIMPLE_DISCIPLINES: SimpleDiscipline[] = ["swim", "bike", "run"];

export type DisciplineRampDefaults = {
  startHours: number;
  peakHours: number;
  ratePercent: number;
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
  swimHours: number;
  bikeHours: number;
  runHours: number;
  totalHours: number;
};

const HOURS_KEY: Record<
  SimpleDiscipline,
  "swimHours" | "bikeHours" | "runHours"
> = {
  swim: "swimHours",
  bike: "bikeHours",
  run: "runHours",
};

export function rampBaseWeekIndex(weeks: SimpleWeekVolume[], weekIndex: number): number {
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

export function recalculateSimpleVolumes(
  weeks: SimpleWeekVolume[],
  phases: SimplePhaseSpan[],
  defaults: SimpleRampDefaults
): SimpleWeekVolume[] {
  const result = weeks.map((week) => ({ ...week }));

  for (const discipline of SIMPLE_DISCIPLINES) {
    const def = defaults[discipline];
    const hoursKey = HOURS_KEY[discipline];

    for (let weekIndex = 0; weekIndex < result.length; weekIndex++) {
      const week = result[weekIndex]!;
      const phase = phaseForWeek(phases, weekIndex);

      if (week.isRestWeek) continue;
      if (!isRampOnForDiscipline(phase, discipline)) continue;

      const baseIndex = rampBaseWeekIndex(result, weekIndex);
      if (baseIndex < 0) {
        week[hoursKey] = roundHours(def.startHours);
        continue;
      }

      const base = result[baseIndex]![hoursKey];
      const rate = def.ratePercent / 100;
      week[hoursKey] = roundHours(Math.min(base * (1 + rate), def.peakHours));
    }
  }

  for (const week of result) {
    week.totalHours = sumWeekHours(week);
  }

  return result;
}

export function defaultSimpleRampDefaults(
  _startHours = 8,
  _peakHours = 16,
  ratePercent = 5
): SimpleRampDefaults {
  return {
    swim: { startHours: 2, peakHours: 4, ratePercent },
    bike: { startHours: 4, peakHours: 8, ratePercent },
    run: { startHours: 2, peakHours: 4, ratePercent },
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
    swim: {
      startHours: plan.swimStartHours ?? roundHours(plan.startHours * (swimPct / 100)),
      peakHours: plan.swimPeakHours ?? roundHours(plan.peakHours * (swimPct / 100)),
      ratePercent: plan.swimRampPercent ?? plan.maxRampPercent,
    },
    bike: {
      startHours: plan.bikeStartHours ?? roundHours(plan.startHours * (bikePct / 100)),
      peakHours: plan.bikePeakHours ?? roundHours(plan.peakHours * (bikePct / 100)),
      ratePercent: plan.bikeRampPercent ?? plan.maxRampPercent,
    },
    run: {
      startHours: plan.runStartHours ?? roundHours(plan.startHours * (runPct / 100)),
      peakHours: plan.runPeakHours ?? roundHours(plan.peakHours * (runPct / 100)),
      ratePercent: plan.runRampPercent ?? plan.maxRampPercent,
    },
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
