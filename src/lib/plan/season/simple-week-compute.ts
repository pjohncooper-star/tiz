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
import { resolvePlanningModeForWeek, type PhasePlanningSpan } from "./planning-mode";
import type { PhaseWithBlocks } from "./phase-blocks";
import type { SimpleWeekVolume } from "./simple-ramp";
import {
  computeZoneMinutesForWeekFromSplits,
  type ZonePhaseSpan,
} from "./zone-split";
import type { DeLoadStrategy } from "@prisma/client";
import type { ZoneFocusCatalog } from "./zone-focus-catalog";
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

function buildSlotBudgets(input: {
  phase: SimplePhaseCompute | null;
  mode: PlanningMode;
  longRideFull: boolean;
  longRunFull: boolean;
  longRideResult: LongOffWeekResult;
  longRunResult: LongOffWeekResult;
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
    const { sessions, intense } = map[discipline];
    const intenseCapped = Math.min(intense, sessions);
    budgets[discipline].intensity = intenseCapped;
    budgets[discipline].endurance = Math.max(0, sessions - intenseCapped);
  }

  if (!input.mode || input.mode === "OVERALL" || input.mode === "BY_DISCIPLINE") {
    return budgets;
  }

  if (input.longRideFull) {
    budgets.BIKE.long = 1;
  } else if (input.longRideResult.kind === "extra_intensity") {
    budgets.BIKE.intensity += 1;
  } else if (input.longRideResult.kind === "substitute_endurance") {
    budgets.BIKE.substituteEndurance = 1;
    budgets.BIKE.substituteDurationMinutes = input.longRideResult.durationMinutes;
  }

  if (input.longRunFull) {
    budgets.RUN.long = 1;
  } else if (input.longRunResult.kind === "extra_intensity") {
    budgets.RUN.intensity += 1;
  } else if (input.longRunResult.kind === "substitute_endurance") {
    budgets.RUN.substituteEndurance = 1;
    budgets.RUN.substituteDurationMinutes = input.longRunResult.durationMinutes;
  }

  return budgets;
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

    if (mode === "OVERALL") {
      const split = applySeasonSplitHours(
        week,
        input.seasonSplit.swim,
        input.seasonSplit.bike,
        input.seasonSplit.run
      );
      swimHours = split.swimHours;
      bikeHours = split.bikeHours;
      runHours = split.runHours;
      totalHours = split.totalHours;
    }

    const isTaper = input.phaseKindsByWeek[week.weekIndex] === "TAPER";
    const suppressLong = shouldSuppressLongForWeek({
      isRestWeek: week.isRestWeek,
      isTaperPhase: isTaper,
      isDeLoadWeek: week.isRestWeek,
    });

    const fullLongRide = !suppressLong && (longRideFlags[week.weekIndex] ?? false);
    const fullLongRun = !suppressLong && (longRunFlags[week.weekIndex] ?? false);

    const fullLongRideMinutes = suppressLong
      ? 0
      : longMinutesForMetric(week.weekIndex, phase, "longRide", input.longAnchors);
    const fullLongRunMinutes = suppressLong
      ? 0
      : longMinutesForMetric(week.weekIndex, phase, "longRun", input.longAnchors);

    let longRideMinutes = 0;
    let longRunMinutes = 0;
    let longRideOff: LongOffWeekResult = { kind: "none" };
    let longRunOff: LongOffWeekResult = { kind: "none" };

    if (mode === "SEPARATE_LONGS" || mode === "SEPARATE_LONG_TIZ") {
      if (fullLongRide) {
        longRideMinutes = fullLongRideMinutes;
      } else if (phase && !suppressLong) {
        longRideOff = applyLongOffWeekPolicy({
          policy: phase.longRideOffWeekPolicy,
          fullLongMinutes: fullLongRideMinutes,
          endurancePercent: phase.longRideOffWeekEndurancePercent,
        });
      }
      if (fullLongRun) {
        longRunMinutes = fullLongRunMinutes;
      } else if (phase && !suppressLong) {
        longRunOff = applyLongOffWeekPolicy({
          policy: phase.longRunOffWeekPolicy,
          fullLongMinutes: fullLongRunMinutes,
          endurancePercent: phase.longRunOffWeekEndurancePercent,
        });
      }
    }

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

    let longSessionZoneMinutes: ZoneMinutes = {};
    if (mode === "SEPARATE_LONG_TIZ") {
      if (longRideMinutes > 0) {
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
      if (longRunMinutes > 0) {
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
      longRideFull: fullLongRide,
      longRunFull: fullLongRun,
      longRideResult: longRideOff,
      longRunResult: longRunOff,
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
