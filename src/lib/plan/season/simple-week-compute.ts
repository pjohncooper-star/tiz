import type {
  LongOffWeekPolicy,
  PhaseKind,
  PlanningMode,
  VolumeMesocycleMode,
} from "@prisma/client";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import {
  resolveLongWeekFlagsForSeason,
} from "./long-session-schedule";
import {
  applyLongOffWeekPolicy,
  shouldSuppressLongForWeek,
  type LongOffWeekResult,
} from "./long-offweek-policy";
import {
  planningModeSeparatesLongVolume,
  resolvePlanningModeForWeek,
  type PhasePlanningSpan,
} from "./planning-mode";
import type { PhaseWithBlocks } from "./phase-blocks";
import type { PhasePlanningUnits, SimpleWeekVolume } from "./simple-ramp";
import {
  computeZoneMinutesForWeekFromSplits,
  type ZonePhaseSpan,
} from "./zone-split";
import type { DeLoadStrategy } from "@prisma/client";
import type { ZoneFocusCatalog } from "./zone-focus-catalog";
import {
  formulaForDiscipline,
  formulaHasLong,
  formulaWeekFromHours,
  type DisciplineFormula,
  type DisciplineFormulaIds,
  type FormulaDiscipline,
  type SessionFormulaCatalog,
} from "./base-formulas";
import {
  endPercentsForDisciplineSplit,
} from "./phase-zone-defaults";
import { lerpZonePercents } from "./zone-split";
import type { PhaseZoneSplits, TriPlanDiscipline } from "./zone-split-types";
import { phaseForWeek, isRampOnForDiscipline } from "./simple-ramp";
import { roundHours } from "./volume-curve";

export type PoolSlotKind =
  | "ENDURANCE"
  | "INTENSITY"
  | "LONG"
  | "SUBSTITUTE_ENDURANCE";

export type DisciplineSlotBudget = {
  endurance: number;
  intensity: number;
  long: number;
  substituteEndurance: number;
  /** Minutes target for substitute endurance slot (mode 3–4 off-week). */
  substituteDurationMinutes: number;
};

export type WeekSlotBudgets = {
  SWIM: DisciplineSlotBudget;
  BIKE: DisciplineSlotBudget;
  RUN: DisciplineSlotBudget;
};

export type SimplePhaseCompute = PhasePlanningSpan & {
  id: string;
  phaseKind: PhaseKind;
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  longRideStartMin?: number | null;
  longRideEndMin?: number | null;
  longRunStartMin?: number | null;
  longRunEndMin?: number | null;
  longRideOffWeekPolicy: LongOffWeekPolicy;
  longRunOffWeekPolicy: LongOffWeekPolicy;
  longRideOffWeekEndurancePercent: number;
  longRunOffWeekEndurancePercent: number;
  zoneSplits?: PhaseZoneSplits | null;
  rampEnabled: { swim: boolean; bike: boolean; run: boolean };
  volumeMesocycleMode?: VolumeMesocycleMode | null;
  volumeProgressionMode?: import("@prisma/client").VolumeProgressionMode | null;
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
  swimPlanningMode?: PhasePlanningUnits["swimPlanningMode"];
  runPlanningMode?: PhasePlanningUnits["runPlanningMode"];
  swimReferencePaceSeconds?: number | null;
  runReferencePaceSeconds?: number | null;
  disciplineFormulaIds?: DisciplineFormulaIds | null;
  startWeekIndex: number;
  endWeekIndex: number;
};

export type ComputedSimpleWeek = SimpleWeekVolume & {
  zoneMinutes: ZoneMinutes;
  longSessionZoneMinutes: ZoneMinutes;
  longRideMinutes: number;
  longRunMinutes: number;
  slotBudgets: WeekSlotBudgets;
  mesocycleId: string | null;
  planningMode: PlanningMode;
};

const TRI: TriPlanDiscipline[] = ["SWIM", "BIKE", "RUN"];

function emptySlotBudget(): DisciplineSlotBudget {
  return {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  };
}

function lerpLongMinutes(
  weekIndex: number,
  phase: SimplePhaseCompute,
  startMin: number,
  endMin: number
): number {
  const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
  const weekInPhase = weekIndex - phase.startWeekIndex;
  const t = weekCount <= 1 ? 1 : weekInPhase / (weekCount - 1);
  return Math.round(startMin + (endMin - startMin) * t);
}

function longMinutesForMetric(
  weekIndex: number,
  phase: SimplePhaseCompute | null,
  metric: "longRide" | "longRun",
  season: { rideStart: number; ridePeak: number; runStart: number; runPeak: number }
): number {
  if (!phase) return 0;
  if (metric === "longRide") {
    const start = phase.longRideStartMin ?? season.rideStart;
    const end = phase.longRideEndMin ?? season.ridePeak;
    return lerpLongMinutes(weekIndex, phase, start, end);
  }
  const start = phase.longRunStartMin ?? season.runStart;
  const end = phase.longRunEndMin ?? season.runPeak;
  return lerpLongMinutes(weekIndex, phase, start, end);
}

function phaseAtWeek(
  weekIndex: number,
  phases: SimplePhaseCompute[]
): SimplePhaseCompute | null {
  return (
    phases.find(
      (p) =>
        p.startWeekIndex >= 0 &&
        weekIndex >= p.startWeekIndex &&
        weekIndex <= p.endWeekIndex
    ) ?? null
  );
}

function applySeasonSplitHours(
  week: SimpleWeekVolume,
  swimPct: number,
  bikePct: number,
  runPct: number
): Pick<SimpleWeekVolume, "swimHours" | "bikeHours" | "runHours" | "totalHours"> {
  const total = week.totalHours;
  const sum = swimPct + bikePct + runPct || 100;
  const swimHours = roundHours((total * swimPct) / sum);
  const bikeHours = roundHours((total * bikePct) / sum);
  const runHours = roundHours((total * runPct) / sum);
  return {
    swimHours,
    bikeHours,
    runHours,
    totalHours: roundHours(swimHours + bikeHours + runHours),
  };
}

function computeLongSessionZoneMinutes(
  longMinutes: number,
  discipline: "BIKE" | "RUN",
  phase: SimplePhaseCompute | null,
  weekIndex: number,
  catalog?: ZoneFocusCatalog
): ZoneMinutes {
  if (longMinutes <= 0 || !phase?.zoneSplits) return {};
  const split = phase.zoneSplits[discipline];
  const endPercents = endPercentsForDisciplineSplit(split, catalog);
  const startPercents = split.startPercents ?? endPercents;
  const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
  const weekInPhase = weekIndex - phase.startWeekIndex;
  const t = weekCount <= 1 ? 1 : weekInPhase / (weekCount - 1);
  const simpleKey = discipline === "BIKE" ? "bike" : "run";
  const rampOn = isRampOnForDiscipline(phase, simpleKey);
  const percents = rampOn ? lerpZonePercents(startPercents, endPercents, t) : endPercents;

  const zones: ZoneMinutes = {};
  const keys = [
    ["z1", 1],
    ["z2", 2],
    ["z3", 3],
    ["z4", 4],
    ["z5", 5],
  ] as const;
  for (const [key, zone] of keys) {
    const pct = percents[key];
    if (pct > 0) {
      zones[zoneKey(discipline, zone)] = Math.round((longMinutes * pct) / 100);
    }
  }
  return zones;
}

export function computeWeekSlotBudgets(input: {
  phase: SimplePhaseCompute | null;
  mode: PlanningMode;
  longRideFull: boolean;
  longRunFull: boolean;
  longRideResult: LongOffWeekResult;
  longRunResult: LongOffWeekResult;
}): WeekSlotBudgets {
  return buildSlotBudgets(input);
}

export type CalendarWeekPoolContext = {
  longRideWeekFlags: boolean[];
  longRunWeekFlags: boolean[];
  longAnchors: {
    rideStart: number;
    ridePeak: number;
    runStart: number;
    runPeak: number;
  };
};

export function totalSlotBudgetCount(budgets: WeekSlotBudgets): number {
  let total = 0;
  for (const discipline of TRI) {
    const row = budgets[discipline];
    total +=
      row.endurance +
      row.intensity +
      row.long +
      row.substituteEndurance;
  }
  return total;
}

/** True when persisted budgets are missing or all-zero but the phase still defines sessions. */
export function needsSlotBudgetBackfill(
  stored: WeekSlotBudgets | null | undefined,
  phase: SimplePhaseCompute | null
): boolean {
  if (!phase) return false;
  const sessions =
    phase.swimSessionsPerWeek +
    phase.bikeSessionsPerWeek +
    phase.runSessionsPerWeek;
  if (sessions <= 0) return false;
  if (!stored) return true;
  return totalSlotBudgetCount(stored) === 0;
}

export type CalendarWeekPoolFields = {
  slotBudgets: WeekSlotBudgets;
  longRideMinutes: number;
  longRunMinutes: number;
};

/** Derive pool slot budgets and long durations for calendar read paths (no DB recalculate). */
export function computeCalendarWeekPoolFields(input: {
  weekIndex: number;
  isRestWeek: boolean;
  phase: SimplePhaseCompute | null;
  planningMode: PlanningMode;
  context: CalendarWeekPoolContext;
  formulaCatalog?: SessionFormulaCatalog;
  disciplineHours?: { SWIM: number; BIKE: number; RUN: number };
}): CalendarWeekPoolFields {
  const { weekIndex, isRestWeek, phase, planningMode, context } = input;
  const mode = planningMode;
  const isTaper = phase?.phaseKind === "TAPER";
  const suppressLong = shouldSuppressLongForWeek({
    isRestWeek,
    isTaperPhase: isTaper,
    isDeLoadWeek: isRestWeek,
  });

  const rideFlag = !suppressLong && (context.longRideWeekFlags[weekIndex] ?? false);
  const runFlag = !suppressLong && (context.longRunWeekFlags[weekIndex] ?? false);
  const formulas = formulaResultsForPhase(phase, input.formulaCatalog ?? []);
  const hours = input.disciplineHours;
  const bikeFormulaWeek =
    formulas.BIKE && hours ? formulaWeekFromHours(formulas.BIKE, hours.BIKE) : null;
  const runFormulaWeek =
    formulas.RUN && hours ? formulaWeekFromHours(formulas.RUN, hours.RUN) : null;

  const fullLongRideMinutes = suppressLong
    ? 0
    : bikeFormulaWeek
      ? bikeFormulaWeek.longMinutes
      : longMinutesForMetric(weekIndex, phase, "longRide", context.longAnchors);
  const fullLongRunMinutes = suppressLong
    ? 0
    : runFormulaWeek
      ? runFormulaWeek.longMinutes
      : longMinutesForMetric(weekIndex, phase, "longRun", context.longAnchors);

  const longFill = resolveLongSeatFill({
    mode,
    phase,
    suppressLong,
    fullLongRide: bikeFormulaWeek ? bikeFormulaWeek.longMinutes > 0 && rideFlag : rideFlag,
    fullLongRun: runFormulaWeek ? runFormulaWeek.longMinutes > 0 && runFlag : runFlag,
    fullLongRideMinutes,
    fullLongRunMinutes,
  });

  const slotBudgets = buildSlotBudgets({
    phase,
    mode,
    longRideFull: bikeFormulaWeek ? bikeFormulaWeek.longMinutes > 0 && rideFlag : rideFlag,
    longRunFull: runFormulaWeek ? runFormulaWeek.longMinutes > 0 && runFlag : runFlag,
    longRideResult: longFill.longRideOff,
    longRunResult: longFill.longRunOff,
    formulaSlots: formulaSlotOverrides(formulas),
  });

  return {
    slotBudgets,
    longRideMinutes: longFill.longRideMinutes,
    longRunMinutes: longFill.longRunMinutes,
  };
}

type FormulaSlotOverride = {
  sessions: number;
  intense: number;
  hasLong: boolean;
};

function buildSlotBudgets(input: {
  phase: SimplePhaseCompute | null;
  mode: PlanningMode;
  longRideFull: boolean;
  longRunFull: boolean;
  longRideResult: LongOffWeekResult;
  longRunResult: LongOffWeekResult;
  formulaSlots?: Partial<Record<TriPlanDiscipline, FormulaSlotOverride>>;
}): WeekSlotBudgets {
  const budgets: WeekSlotBudgets = {
    SWIM: emptySlotBudget(),
    BIKE: emptySlotBudget(),
    RUN: emptySlotBudget(),
  };
  if (!input.phase) return budgets;

  // Rest-week load is expressed via volume/TiZ cuts, not fewer slot counts (Option B).
  const map = {
    SWIM: {
      sessions: input.phase.swimSessionsPerWeek,
      intense: input.phase.swimIntenseDaysPerWeek,
    },
    BIKE: {
      sessions: input.phase.bikeSessionsPerWeek,
      intense: input.phase.bikeIntenseDaysPerWeek,
    },
    RUN: {
      sessions: input.phase.runSessionsPerWeek,
      intense: input.phase.runIntenseDaysPerWeek,
    },
  } as const;

  for (const discipline of TRI) {
    const override = input.formulaSlots?.[discipline];
    const sessions = override?.sessions ?? map[discipline].sessions;
    const intense = override?.intense ?? map[discipline].intense;
    const reservesLong =
      discipline !== "SWIM" &&
      sessions > 0 &&
      (override ? override.hasLong : true);
    const mainSessions = reservesLong ? Math.max(0, sessions - 1) : sessions;
    const intenseCapped = Math.min(intense, mainSessions);
    budgets[discipline].intensity = intenseCapped;
    budgets[discipline].endurance = Math.max(0, mainSessions - intenseCapped);
  }

  // Off-week policies fill the reserved long seat (replace), not add on top.
  if (!input.formulaSlots?.BIKE || input.formulaSlots.BIKE.hasLong) {
    fillReservedLongSeat(
      budgets.BIKE,
      input.formulaSlots?.BIKE?.sessions ?? map.BIKE.sessions,
      {
        full: input.longRideFull,
        result: input.longRideResult,
      }
    );
  }
  if (!input.formulaSlots?.RUN || input.formulaSlots.RUN.hasLong) {
    fillReservedLongSeat(
      budgets.RUN,
      input.formulaSlots?.RUN?.sessions ?? map.RUN.sessions,
      {
        full: input.longRunFull,
        result: input.longRunResult,
      }
    );
  }

  return budgets;
}

function fillReservedLongSeat(
  budget: DisciplineSlotBudget,
  sessions: number,
  input: { full: boolean; result: LongOffWeekResult }
) {
  if (sessions <= 0) return;
  if (input.full) {
    budget.long = 1;
    return;
  }
  if (input.result.kind === "extra_intensity") {
    budget.intensity += 1;
    return;
  }
  if (input.result.kind === "substitute_endurance") {
    budget.substituteEndurance = 1;
    budget.substituteDurationMinutes = input.result.durationMinutes;
    return;
  }
  if (input.result.kind === "endurance") {
    budget.endurance += 1;
  }
}

function resolveLongSeatFill(input: {
  mode: PlanningMode;
  phase: SimplePhaseCompute | null;
  suppressLong: boolean;
  fullLongRide: boolean;
  fullLongRun: boolean;
  fullLongRideMinutes: number;
  fullLongRunMinutes: number;
}): {
  longRideMinutes: number;
  longRunMinutes: number;
  longRideOff: LongOffWeekResult;
  longRunOff: LongOffWeekResult;
} {
  const separatesVolume = planningModeSeparatesLongVolume(input.mode);
  const ride = resolveOneLongSeatFill({
    separatesVolume,
    phase: input.phase,
    suppressLong: input.suppressLong,
    fullLong: input.fullLongRide,
    fullLongMinutes: input.fullLongRideMinutes,
    policy: input.phase?.longRideOffWeekPolicy,
    endurancePercent: input.phase?.longRideOffWeekEndurancePercent,
  });
  const run = resolveOneLongSeatFill({
    separatesVolume,
    phase: input.phase,
    suppressLong: input.suppressLong,
    fullLong: input.fullLongRun,
    fullLongMinutes: input.fullLongRunMinutes,
    policy: input.phase?.longRunOffWeekPolicy,
    endurancePercent: input.phase?.longRunOffWeekEndurancePercent,
  });
  return {
    longRideMinutes: ride.minutes,
    longRideOff: ride.off,
    longRunMinutes: run.minutes,
    longRunOff: run.off,
  };
}

function resolveOneLongSeatFill(input: {
  separatesVolume: boolean;
  phase: SimplePhaseCompute | null;
  suppressLong: boolean;
  fullLong: boolean;
  fullLongMinutes: number;
  policy: LongOffWeekPolicy | undefined;
  endurancePercent: number | undefined;
}): { minutes: number; off: LongOffWeekResult } {
  if (input.fullLong) {
    return {
      minutes: input.separatesVolume ? input.fullLongMinutes : 0,
      off: { kind: "none" },
    };
  }
  if (!input.phase || input.suppressLong) {
    return { minutes: 0, off: { kind: "none" } };
  }
  if (input.separatesVolume) {
    return {
      minutes: 0,
      off: applyLongOffWeekPolicy({
        policy: input.policy ?? "ENDURANCE_PERCENT",
        fullLongMinutes: input.fullLongMinutes,
        endurancePercent: input.endurancePercent ?? 60,
      }),
    };
  }
  return { minutes: 0, off: { kind: "endurance" } };
}

function formulaResultsForPhase(
  phase: SimplePhaseCompute | null,
  catalog: SessionFormulaCatalog
): Partial<Record<FormulaDiscipline, DisciplineFormula>> {
  const resolved: Partial<Record<FormulaDiscipline, DisciplineFormula>> = {};
  if (!phase) return resolved;
  for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
    const formula = formulaForDiscipline(catalog, phase.disciplineFormulaIds, discipline);
    if (formula) resolved[discipline] = formula;
  }
  return resolved;
}

function applyFormulaZoneMinutes(
  zoneMinutes: ZoneMinutes,
  discipline: FormulaDiscipline,
  formula: DisciplineFormula | undefined,
  hours: number
): void {
  if (!formula) return;
  const week = formulaWeekFromHours(formula, hours);
  for (let zone = 1; zone <= 5; zone += 1) {
    const key = zoneKey(discipline, zone);
    const minutes = week.zoneMinutes[zone as 1 | 2 | 3 | 4 | 5];
    if (minutes > 0) zoneMinutes[key] = minutes;
    else delete zoneMinutes[key];
  }
}

function formulaSlotOverrides(
  formulas: Partial<Record<FormulaDiscipline, DisciplineFormula>>
): Partial<Record<TriPlanDiscipline, FormulaSlotOverride>> {
  const slots: Partial<Record<TriPlanDiscipline, FormulaSlotOverride>> = {};
  for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
    const formula = formulas[discipline];
    if (!formula) continue;
    slots[discipline] = {
      sessions: formula.sessions.length,
      intense: formula.sessions.filter((session) => session.intensity && !session.long).length,
      hasLong: formulaHasLong(formula),
    };
  }
  return slots;
}

export function enrichSimpleSeasonWeeks(input: {
  weeks: SimpleWeekVolume[];
  phases: SimplePhaseCompute[];
  zonePhaseSpans: ZonePhaseSpan[];
  phasesWithBlocks: PhaseWithBlocks[];
  seasonDefaultPlanningMode: PlanningMode;
  deLoadStrategy: DeLoadStrategy;
  catalog?: ZoneFocusCatalog;
  seasonSplit: { swim: number; bike: number; run: number };
  longAnchors: {
    rideStart: number;
    ridePeak: number;
    runStart: number;
    runPeak: number;
  };
  phaseKindsByWeek: PhaseKind[];
  taperWeekIndices: number[];
  deLoadEveryNWeeks: number;
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
  formulaCatalog?: SessionFormulaCatalog;
}): ComputedSimpleWeek[] {
  const totalWeeks = input.weeks.length;
  const longRideFlags = resolveLongWeekFlagsForSeason({
    totalWeeks,
    stored: input.longRideWeekFlags,
  });
  const longRunFlags = resolveLongWeekFlagsForSeason({
    totalWeeks,
    stored: input.longRunWeekFlags,
  });

  return input.weeks.map((week) => {
    const phase = phaseAtWeek(week.weekIndex, input.phases);
    const mode = resolvePlanningModeForWeek(
      week.weekIndex,
      input.phases,
      input.seasonDefaultPlanningMode
    );

    let swimHours = week.swimHours;
    let bikeHours = week.bikeHours;
    let runHours = week.runHours;
    let totalHours = week.totalHours;

    const formulaByDiscipline = formulaResultsForPhase(
      phase,
      input.formulaCatalog ?? []
    );

    if (mode === "OVERALL") {
      const split = applySeasonSplitHours(
        week,
        input.seasonSplit.swim,
        input.seasonSplit.bike,
        input.seasonSplit.run
      );
      swimHours = formulaByDiscipline.SWIM ? week.swimHours : split.swimHours;
      bikeHours = formulaByDiscipline.BIKE ? week.bikeHours : split.bikeHours;
      runHours = formulaByDiscipline.RUN ? week.runHours : split.runHours;
      totalHours = roundHours(swimHours + bikeHours + runHours);
    }

    const isTaper = input.phaseKindsByWeek[week.weekIndex] === "TAPER";
    const suppressLong = shouldSuppressLongForWeek({
      isRestWeek: week.isRestWeek,
      isTaperPhase: isTaper,
      isDeLoadWeek: week.isRestWeek,
    });

    const fullLongRide = !suppressLong && (longRideFlags[week.weekIndex] ?? false);
    const fullLongRun = !suppressLong && (longRunFlags[week.weekIndex] ?? false);

    const runFormulaWeek = formulaByDiscipline.RUN
      ? formulaWeekFromHours(formulaByDiscipline.RUN, runHours)
      : null;
    const bikeFormulaWeek = formulaByDiscipline.BIKE
      ? formulaWeekFromHours(formulaByDiscipline.BIKE, bikeHours)
      : null;

    const fullLongRideMinutes = suppressLong
      ? 0
      : bikeFormulaWeek
        ? bikeFormulaWeek.longMinutes
        : longMinutesForMetric(week.weekIndex, phase, "longRide", input.longAnchors);
    const fullLongRunMinutes = suppressLong
      ? 0
      : runFormulaWeek
        ? runFormulaWeek.longMinutes
        : longMinutesForMetric(week.weekIndex, phase, "longRun", input.longAnchors);

    const longFill = resolveLongSeatFill({
      mode,
      phase,
      suppressLong,
      fullLongRide,
      fullLongRun,
      fullLongRideMinutes,
      fullLongRunMinutes,
    });
    const { longRideMinutes, longRunMinutes, longRideOff, longRunOff } = longFill;

    const zoneMinutes = computeZoneMinutesForWeekFromSplits({
      week: {
        weekIndex: week.weekIndex,
        isRestWeek: week.isRestWeek,
        swimHours,
        bikeHours,
        runHours,
      },
      phases: input.zonePhaseSpans,
      deLoadStrategy: input.deLoadStrategy,
      catalog: input.catalog,
    });
    applyFormulaZoneMinutes(zoneMinutes, "SWIM", formulaByDiscipline.SWIM, swimHours);
    applyFormulaZoneMinutes(zoneMinutes, "BIKE", formulaByDiscipline.BIKE, bikeHours);
    applyFormulaZoneMinutes(zoneMinutes, "RUN", formulaByDiscipline.RUN, runHours);

    let longSessionZoneMinutes: ZoneMinutes = {};
    if (mode === "SEPARATE_LONG_TIZ") {
      if (longRideMinutes > 0 && !formulaByDiscipline.BIKE) {
        longSessionZoneMinutes = {
          ...longSessionZoneMinutes,
          ...computeLongSessionZoneMinutes(
            longRideMinutes,
            "BIKE",
            phase,
            week.weekIndex,
            input.catalog
          ),
        };
      }
      if (longRunMinutes > 0 && !formulaByDiscipline.RUN) {
        longSessionZoneMinutes = {
          ...longSessionZoneMinutes,
          ...computeLongSessionZoneMinutes(
            longRunMinutes,
            "RUN",
            phase,
            week.weekIndex,
            input.catalog
          ),
        };
      }
    }

    const mesocycleId =
      input.phasesWithBlocks
        .flatMap((p) => p.blocks)
        .find(
          (b) =>
            week.weekIndex >= b.startWeekIndex && week.weekIndex <= b.endWeekIndex
        )?.id ?? null;

    const slotBudgets = buildSlotBudgets({
      phase,
      mode,
      longRideFull: bikeFormulaWeek ? bikeFormulaWeek.longMinutes > 0 && fullLongRide : fullLongRide,
      longRunFull: runFormulaWeek ? runFormulaWeek.longMinutes > 0 && fullLongRun : fullLongRun,
      longRideResult: longRideOff,
      longRunResult: longRunOff,
      formulaSlots: formulaSlotOverrides(formulaByDiscipline),
    });

    return {
      ...week,
      swimHours,
      bikeHours,
      runHours,
      totalHours,
      zoneMinutes,
      longSessionZoneMinutes,
      longRideMinutes,
      longRunMinutes,
      slotBudgets,
      mesocycleId,
      planningMode: mode,
    };
  });
}
