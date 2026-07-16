import type { DeLoadStrategy } from "@prisma/client";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import { DE_LOAD_INTENSITY_SHIFT } from "./constants";
import {
  endPercentsForDisciplineSplit,
  startPercentsForDisciplineSplit,
  normalizeZoneSplitPercents,
} from "./phase-zone-defaults";
import type { ZoneFocusCatalog } from "./zone-focus-catalog";
import {
  phaseForWeek,
  isRampOnForDiscipline,
  type SimpleDiscipline,
  type SimplePhaseSpan,
} from "./simple-ramp";
import type { ZoneSplitPercents, PhaseZoneSplits, TriPlanDiscipline } from "./zone-split-types";

const SIMPLE_TO_TRI: Record<SimpleDiscipline, TriPlanDiscipline> = {
  swim: "SWIM",
  bike: "BIKE",
  run: "RUN",
};

const TRI_DISCIPLINES: TriPlanDiscipline[] = ["SWIM", "BIKE", "RUN"];

const HOURS_KEY: Record<TriPlanDiscipline, "swimHours" | "bikeHours" | "runHours"> = {
  SWIM: "swimHours",
  BIKE: "bikeHours",
  RUN: "runHours",
};

export type ZonePhaseSpan = SimplePhaseSpan & {
  zoneSplits: PhaseZoneSplits;
};

export type WeekZoneInput = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
};

function roundMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

export function lerpZonePercents(
  start: ZoneSplitPercents,
  end: ZoneSplitPercents,
  t: number
): ZoneSplitPercents {
  const clamped = Math.max(0, Math.min(1, t));
  return normalizeZoneSplitPercents({
    z1: start.z1 + (end.z1 - start.z1) * clamped,
    z2: start.z2 + (end.z2 - start.z2) * clamped,
    z3: start.z3 + (end.z3 - start.z3) * clamped,
    z4: start.z4 + (end.z4 - start.z4) * clamped,
    z5: start.z5 + (end.z5 - start.z5) * clamped,
  });
}

function applyDeLoadIntensityShift(
  percents: ZoneSplitPercents,
  strategy: DeLoadStrategy,
  isDeLoadWeek: boolean
): ZoneSplitPercents {
  if (!isDeLoadWeek) return percents;
  const shift = DE_LOAD_INTENSITY_SHIFT[strategy];
  if (!shift) return percents;

  const highCut = (percents.z4 + percents.z5) * (shift.z4z5Cut / 100);
  const z4 = percents.z4 * (1 - shift.z4z5Cut / 100);
  const z5 = percents.z5 * (1 - shift.z4z5Cut / 100);
  const z1 = percents.z1 + highCut + shift.z1Boost;
  return normalizeZoneSplitPercents({ z1, z2: percents.z2, z3: percents.z3, z4, z5 });
}

function minutesFromPercents(totalMinutes: number, percents: ZoneSplitPercents): number[] {
  const p = normalizeZoneSplitPercents(percents);
  return [
    (totalMinutes * p.z1) / 100,
    (totalMinutes * p.z2) / 100,
    (totalMinutes * p.z3) / 100,
    (totalMinutes * p.z4) / 100,
    (totalMinutes * p.z5) / 100,
  ];
}

function targetPercentsForPhase(
  phase: ZonePhaseSpan | null,
  discipline: TriPlanDiscipline,
  catalog?: ZoneFocusCatalog
): ZoneSplitPercents {
  if (!phase) {
    return normalizeZoneSplitPercents({ z1: 100, z2: 0, z3: 0, z4: 0, z5: 0 });
  }
  const split = phase.zoneSplits[discipline];
  return endPercentsForDisciplineSplit(split, catalog);
}

function sortedZonePhases(phases: ZonePhaseSpan[]): ZonePhaseSpan[] {
  return [...phases]
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);
}

export function resolveZonePercentsForWeek(input: {
  weekIndex: number;
  phases: ZonePhaseSpan[];
  discipline: TriPlanDiscipline;
  catalog?: ZoneFocusCatalog;
}): ZoneSplitPercents {
  const sorted = sortedZonePhases(input.phases);
  const phase = phaseForWeek(sorted, input.weekIndex) as ZonePhaseSpan | null;
  if (!phase) {
    const prior = sorted.filter((item) => item.endWeekIndex < input.weekIndex).at(-1);
    return targetPercentsForPhase(prior ?? null, input.discipline, input.catalog);
  }

  const exitPercents = targetPercentsForPhase(phase, input.discipline, input.catalog);
  const explicitStart = startPercentsForDisciplineSplit(phase.zoneSplits[input.discipline]);
  const priorPhase = sorted
    .filter((item) => item.endWeekIndex < phase.startWeekIndex)
    .at(-1);
  const entryPercents =
    explicitStart ??
    (priorPhase
      ? targetPercentsForPhase(priorPhase, input.discipline, input.catalog)
      : exitPercents);

  const simpleDiscipline = Object.entries(SIMPLE_TO_TRI).find(
    ([, tri]) => tri === input.discipline
  )?.[0] as SimpleDiscipline | undefined;

  if (!simpleDiscipline || !isRampOnForDiscipline(phase, simpleDiscipline)) {
    return exitPercents;
  }

  const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
  const weekInPhase = input.weekIndex - phase.startWeekIndex;
  const t = weekCount <= 1 ? 1 : weekInPhase / (weekCount - 1);
  return lerpZonePercents(entryPercents, exitPercents, t);
}

export function computeZoneMinutesForWeekFromSplits(input: {
  week: WeekZoneInput;
  phases: ZonePhaseSpan[];
  deLoadStrategy: DeLoadStrategy;
  catalog?: ZoneFocusCatalog;
}): ZoneMinutes {
  const zones: ZoneMinutes = {};

  for (const discipline of TRI_DISCIPLINES) {
    let percents = resolveZonePercentsForWeek({
      weekIndex: input.week.weekIndex,
      phases: input.phases,
      discipline,
      catalog: input.catalog,
    });
    percents = applyDeLoadIntensityShift(
      percents,
      input.deLoadStrategy,
      input.week.isRestWeek
    );

    const totalMinutes = input.week[HOURS_KEY[discipline]] * 60;
    const zoneMins = minutesFromPercents(totalMinutes, percents);
    for (let z = 1; z <= 5; z++) {
      zones[zoneKey(discipline, z)] = roundMinutes(zoneMins[z - 1]!);
    }
  }

  return zones;
}

export function recalculateZoneMinutesFromSplits(
  weeks: WeekZoneInput[],
  phases: ZonePhaseSpan[],
  deLoadStrategy: DeLoadStrategy,
  catalog?: ZoneFocusCatalog
): ZoneMinutes[] {
  return weeks.map((week) =>
    computeZoneMinutesForWeekFromSplits({ week, phases, deLoadStrategy, catalog })
  );
}
