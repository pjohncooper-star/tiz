import type { PhaseKind } from "@prisma/client";
import { markDeLoadWeeksPerMesocycle, mergeDeLoadFlags, taperWeekIndicesFromPhaseKinds } from "./de-load-cadence";
import { splitHoursByDiscipline } from "./discipline-split";
import { computeZoneMinutesForWeek } from "./focus-tiz";
import { computeLongSessionsForWeek } from "./long-session-ramp";
import {
  applyLongSessionTier,
  defaultLongWeekFlags,
  mergeLongWeekFlags,
} from "./long-session-schedule";
import { mesocycleForWeekIndex, resolveMesocycles } from "./phase-split";
import { applyDeLoadSessionScaling, baseSessionCounts } from "./session-counts";
import {
  buildSeasonDateBounds,
  weekStartDateForIndex,
} from "./season-dates";
import type {
  ComputedSeasonWeek,
  SeasonPhaseInput,
  SeasonPlanComputeInput,
  SeasonRecomputeResult,
  WeekPhaseContext,
} from "./types";
import { computeWeeklyVolumeCurve } from "./volume-curve";

function expandPhaseKinds(phases: SeasonPhaseInput[], totalWeeks: number): PhaseKind[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const kinds: PhaseKind[] = [];
  for (const phase of sorted) {
    for (let w = 0; w < phase.weekCount; w++) {
      kinds.push(phase.phaseKind);
    }
  }
  while (kinds.length < totalWeeks) {
    kinds.push(sorted[sorted.length - 1]?.phaseKind ?? "BUILD");
  }
  return kinds.slice(0, totalWeeks);
}

function expandPhaseContexts(
  phases: SeasonPhaseInput[],
  totalWeeks: number,
  seasonStart: Date,
  mesocycles: ReturnType<typeof resolveMesocycles>,
  deLoadFlags: boolean[]
): WeekPhaseContext[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const contexts: WeekPhaseContext[] = [];
  let phaseIndex = 0;
  let weekInPhase = 0;

  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    while (
      phaseIndex < sorted.length - 1 &&
      weekInPhase >= (sorted[phaseIndex]?.weekCount ?? 0)
    ) {
      phaseIndex += 1;
      weekInPhase = 0;
    }

    const phase = sorted[phaseIndex]!;
    const meso = mesocycleForWeekIndex(mesocycles, weekIndex);

    contexts.push({
      weekIndex,
      phaseIndex,
      phaseKind: phase.phaseKind,
      phase,
      mesocycleIndex: meso?.index ?? 0,
      mesocycleName: meso?.name ?? phase.name,
      isDeLoadWeek: deLoadFlags[weekIndex] ?? false,
      weekStartDate: weekStartDateForIndex(seasonStart, weekIndex),
    });

    weekInPhase += 1;
  }

  return contexts;
}

export function validatePhaseWeekCounts(
  phases: SeasonPhaseInput[],
  totalWeeks: number
): void {
  const sum = phases.reduce((acc, p) => acc + p.weekCount, 0);
  if (sum !== totalWeeks) {
    throw new Error(
      `Phase week counts (${sum}) must equal season total weeks (${totalWeeks})`
    );
  }
}

export function recomputeSeasonWeeks(
  input: SeasonPlanComputeInput
): SeasonRecomputeResult {
  const bounds = buildSeasonDateBounds(input.startDate, input.endDate);
  validatePhaseWeekCounts(input.phases, bounds.totalWeeks);

  const phaseKindsByWeek = expandPhaseKinds(input.phases, bounds.totalWeeks);
  const taperWeeks = taperWeekIndicesFromPhaseKinds(
    phaseKindsByWeek,
    bounds.totalWeeks
  );
  const mesocycles = resolveMesocycles(input.phases, input.mesocycleLengthWeeks);
  const defaultDeLoadFlags = markDeLoadWeeksPerMesocycle({
    mesocycles,
    totalWeeks: bounds.totalWeeks,
    everyNWeeks: input.deLoadEveryNWeeks,
    taperWeekIndices: taperWeeks,
  });
  const deLoadFlags = mergeDeLoadFlags(defaultDeLoadFlags, input.deLoadWeekFlags);

  const defaultLongRideFlags = defaultLongWeekFlags({
    totalWeeks: bounds.totalWeeks,
    phaseKindsByWeek,
    mesocycles,
    deLoadFlags,
  });
  const defaultLongRunFlags = defaultLongWeekFlags({
    totalWeeks: bounds.totalWeeks,
    phaseKindsByWeek,
    mesocycles,
    deLoadFlags,
  });
  const longRideWeekFlags = mergeLongWeekFlags(
    defaultLongRideFlags,
    input.longRideWeekFlags
  );
  const longRunWeekFlags = mergeLongWeekFlags(
    defaultLongRunFlags,
    input.longRunWeekFlags
  );

  const weeklyHours = computeWeeklyVolumeCurve({
    totalWeeks: bounds.totalWeeks,
    phaseKindsByWeek,
    phases: input.phases,
    mesocycles,
    startHours: input.startHours,
    peakHours: input.peakHours,
    maxRampPercent: input.maxRampPercent,
    deLoadFlags,
    deLoadVolumePercent: input.deLoadVolumePercent,
  });

  const contexts = expandPhaseContexts(
    input.phases,
    bounds.totalWeeks,
    bounds.startDate,
    mesocycles,
    deLoadFlags
  );

  const weeks: ComputedSeasonWeek[] = contexts.map((ctx) => {
    const totalHours = weeklyHours[ctx.weekIndex]!;
    const { swimHours, bikeHours, runHours } = splitHoursByDiscipline(
      totalHours,
      ctx.phaseKind
    );

    const baseCounts = baseSessionCounts({
      swimSessionsPerWeek: ctx.phase.swimSessionsPerWeek,
      bikeSessionsPerWeek: ctx.phase.bikeSessionsPerWeek,
      runSessionsPerWeek: ctx.phase.runSessionsPerWeek,
    });
    const sessions = applyDeLoadSessionScaling(baseCounts, {
      isDeLoadWeek: ctx.isDeLoadWeek,
      reduceCountsOnDeLoad: input.reduceCountsOnDeLoad,
      deLoadCountScalePercent: input.deLoadCountScalePercent,
    });

    const zoneMinutes = computeZoneMinutesForWeek({
      phase: ctx.phase,
      swimHours,
      bikeHours,
      runHours,
      deLoadStrategy: input.deLoadStrategy,
      isDeLoadWeek: ctx.isDeLoadWeek,
    });

    const fullLongSessions = computeLongSessionsForWeek(
      ctx.weekIndex,
      phaseKindsByWeek,
      input.phases,
      mesocycles,
      { startHours: input.startHours, peakHours: input.peakHours },
      {
        startMin: input.longRideStartMin,
        peakMin: input.longRidePeakMin,
      },
      {
        startMin: input.longRunStartMin,
        peakMin: input.longRunPeakMin,
      }
    );
    const longRideMinutes = applyLongSessionTier(
      fullLongSessions.longRideMinutes,
      longRideWeekFlags[ctx.weekIndex] ?? false
    );
    const longRunMinutes = applyLongSessionTier(
      fullLongSessions.longRunMinutes,
      longRunWeekFlags[ctx.weekIndex] ?? false
    );

    return {
      weekIndex: ctx.weekIndex,
      weekStartDate: ctx.weekStartDate,
      isDeLoadWeek: ctx.isDeLoadWeek,
      phaseIndex: ctx.phaseIndex,
      mesocycleIndex: ctx.mesocycleIndex,
      mesocycleName: ctx.mesocycleName,
      totalHours,
      swimHours,
      bikeHours,
      runHours,
      zoneMinutes,
      swimSessions: sessions.swimSessions,
      bikeSessions: sessions.bikeSessions,
      runSessions: sessions.runSessions,
      longRideMinutes,
      longRunMinutes,
    };
  });

  return { bounds, mesocycles, weeks };
}
