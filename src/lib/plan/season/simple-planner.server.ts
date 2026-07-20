import { Prisma, type DeLoadStrategy, type PhaseKind, type PlanningMode } from "@prisma/client";
import { db } from "@/lib/db";
import { calendarDateFromDb, formatDateKey } from "@/lib/dates";
import {
  createGoalEventsWithCalendar,
  removeGoalEvents,
  syncGoalEventsByPriority,
  upsertPrimaryGoalEvent,
  type GoalEventWriteInput,
  type RemovedGoalEventInput,
} from "./goal-events-sync";
import {
  assertNoSeasonOverlap,
  findOverlappingSeasonPlans,
  formatSeasonOverlapError,
  getSeasonPlanById,
  type SeasonPlanSummary,
} from "./season-plan.server";
import {
  buildSeasonDateBounds,
  deriveSeasonStatus,
  weekStartDateForIndex,
} from "./season-dates";
import {
  defaultSimpleRampDefaults,
  rampDefaultsToPlanFields,
  recalculateSimpleVolumes,
  resolveSimpleRampDefaults,
  type SimpleDiscipline,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
} from "./simple-ramp";
import {
  recalculatePhaseAwareVolumes,
  type PhaseVolumeSpan,
} from "./simple-phase-volume";
import { fitSimplePhasesToTotalWeeks } from "./phase-span-utils";
import {
  parsePhaseKindZoneDefaults,
  resolvePhaseKindZoneDefaultsForNewSeason,
  resolvePhaseZoneSplits,
  serializePhaseKindZoneDefaults,
} from "./phase-zone-defaults";
import {
  parseZoneFocusCatalog,
  type ZoneFocusCatalog,
} from "./zone-focus-catalog";
import type { PhaseKindZoneDefaults, PhaseZoneSplits } from "./zone-split-types";
import {
  recalculateZoneMinutesFromSplits,
  type ZonePhaseSpan,
} from "./zone-split";
import {
  parseDisciplineZoneMinutes,
} from "./simple-tiz";
import { type ZoneMinutes } from "@/lib/workout/steps";
import { roundHours } from "./volume-curve";
import { DEFAULT_REST_VOLUME_PERCENT } from "./constants";
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";
import { buildPhaseBlocks, type PhaseWithBlocks } from "./phase-blocks";
import {
  enrichSimpleSeasonWeeks,
  type ComputedSimpleWeek,
  type SimplePhaseCompute,
} from "./simple-week-compute";
import {
  initialLongWeekFlags,
  parseLongWeekFlags,
  resolveLongWeekFlagsForSeason,
} from "./long-session-schedule";
import { resolveTestWeekFlagsForSeason } from "@/lib/plan/calendar/week-template-resolution";

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export async function loadAthleteZoneFocusCatalog(
  athleteId: string
): Promise<ZoneFocusCatalog> {
  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { zoneFocusCatalog: true },
    });
    return parseZoneFocusCatalog(athlete?.zoneFocusCatalog);
  } catch {
    return parseZoneFocusCatalog(null);
  }
}

export type SimplePhaseWrite = {
  id?: string;
  name: string;
  color: string;
  phaseKind: PhaseKind;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: Record<SimpleDiscipline, boolean>;
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  goal?: string | null;
  zoneSplits?: PhaseZoneSplits | null;
  weeklyTemplateId?: string | null;
  planningMode?: PlanningMode | null;
  longRideStartMin?: number | null;
  longRideEndMin?: number | null;
  longRunStartMin?: number | null;
  longRunEndMin?: number | null;
  longRideOffWeekPolicy?: SimplePhaseCompute["longRideOffWeekPolicy"];
  longRunOffWeekPolicy?: SimplePhaseCompute["longRunOffWeekPolicy"];
  longRideOffWeekEndurancePercent?: number;
  longRunOffWeekEndurancePercent?: number;
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
  volumeMesocycleMode?: import("@prisma/client").VolumeMesocycleMode | null;
};

export type SimpleWeekWrite = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  swimDistanceMeters?: number | null;
  runDistanceMeters?: number | null;
};

export type CreateSimpleSeasonInput = {
  athleteId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  rampDefaults?: SimpleRampDefaults;
  phaseKindZoneDefaults?: PhaseKindZoneDefaults;
  defaultPlanningMode?: PlanningMode;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type UpdateSimpleSeasonInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  rampDefaults?: SimpleRampDefaults;
  deLoadVolumePercent?: number;
  phaseKindZoneDefaults?: PhaseKindZoneDefaults;
  defaultPlanningMode?: PlanningMode;
  phases?: SimplePhaseWrite[];
  weeks?: SimpleWeekWrite[];
  recalculate?: boolean;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
  removedGoalEvents?: RemovedGoalEventInput[];
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
  testWeekFlags?: boolean[] | null;
  restWeekTemplateId?: string | null;
  testWeekTemplateId?: string | null;
};

function phaseWritesToDb(phases: SimplePhaseWrite[]) {
  return [...phases]
    .sort((a, b) => {
      const aStart = a.startWeekIndex < 0 ? Number.MAX_SAFE_INTEGER : a.startWeekIndex;
      const bStart = b.startWeekIndex < 0 ? Number.MAX_SAFE_INTEGER : b.startWeekIndex;
      return aStart - bStart;
    })
    .map((phase, sortOrder) => {
      const assigned = phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex;
      const write = phase;
      return {
        id: phase.id ?? cuid(),
        name: phase.name.trim() || `Phase ${sortOrder + 1}`,
        sortOrder,
        weekCount: assigned ? phase.endWeekIndex - phase.startWeekIndex + 1 : 0,
        startWeekIndex: assigned ? phase.startWeekIndex : -1,
        color: phase.color || "#38bdf8",
        rampSwimEnabled: phase.rampEnabled.swim,
        rampBikeEnabled: phase.rampEnabled.bike,
        rampRunEnabled: phase.rampEnabled.run,
        swimSessionsPerWeek: Math.max(0, Math.round(phase.swimSessionsPerWeek)),
        bikeSessionsPerWeek: Math.max(0, Math.round(phase.bikeSessionsPerWeek)),
        runSessionsPerWeek: Math.max(0, Math.round(phase.runSessionsPerWeek)),
        weeklyTemplateId: write.weeklyTemplateId ?? null,
        planningMode: write.planningMode ?? null,
        longRideStartMin: write.longRideStartMin ?? null,
        longRideEndMin: write.longRideEndMin ?? null,
        longRunStartMin: write.longRunStartMin ?? null,
        longRunEndMin: write.longRunEndMin ?? null,
        longRideOffWeekPolicy: write.longRideOffWeekPolicy ?? "ENDURANCE_PERCENT",
        longRunOffWeekPolicy: write.longRunOffWeekPolicy ?? "ENDURANCE_PERCENT",
        longRideOffWeekEndurancePercent: write.longRideOffWeekEndurancePercent ?? 60,
        longRunOffWeekEndurancePercent: write.longRunOffWeekEndurancePercent ?? 60,
        volumeStartHours: write.volumeStartHours ?? null,
        volumeEndHours: write.volumeEndHours ?? null,
        volumeRampPercent: write.volumeRampPercent ?? null,
        swimStartHours: write.swimStartHours ?? null,
        swimEndHours: write.swimEndHours ?? null,
        swimRampPercent: write.swimRampPercent ?? null,
        bikeStartHours: write.bikeStartHours ?? null,
        bikeEndHours: write.bikeEndHours ?? null,
        bikeRampPercent: write.bikeRampPercent ?? null,
        runStartHours: write.runStartHours ?? null,
        runEndHours: write.runEndHours ?? null,
        runRampPercent: write.runRampPercent ?? null,
        volumeMesocycleMode: write.volumeMesocycleMode ?? null,
        coachNotes: serializePhaseCoachNotes({
          goal: phase.goal ?? null,
          strengthSessionsPerWeek: phase.strengthSessionsPerWeek,
          swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
          bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
          runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
          zoneSplits: phase.zoneSplits ?? null,
        }),
      };
    });
}

function phaseComputeFromWrites(
  phases: SimplePhaseWrite[],
  kindDefaults: PhaseKindZoneDefaults
): SimplePhaseCompute[] {
  return phases
    .filter((p) => p.startWeekIndex >= 0 && p.endWeekIndex >= p.startWeekIndex)
    .map((phase) => ({
      id: phase.id ?? "",
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      planningMode: phase.planningMode ?? null,
      phaseKind: phase.phaseKind,
      swimSessionsPerWeek: phase.swimSessionsPerWeek,
      bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
      runSessionsPerWeek: phase.runSessionsPerWeek,
      swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
      bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
      runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
      longRideStartMin: phase.longRideStartMin,
      longRideEndMin: phase.longRideEndMin,
      longRunStartMin: phase.longRunStartMin,
      longRunEndMin: phase.longRunEndMin,
      longRideOffWeekPolicy: phase.longRideOffWeekPolicy ?? "ENDURANCE_PERCENT",
      longRunOffWeekPolicy: phase.longRunOffWeekPolicy ?? "ENDURANCE_PERCENT",
      longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent ?? 60,
      longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent ?? 60,
      zoneSplits: resolvePhaseZoneSplits({
        phaseKind: phase.phaseKind,
        phaseZoneSplits: phase.zoneSplits,
        kindDefaults,
      }),
      rampEnabled: phase.rampEnabled,
      volumeMesocycleMode: phase.volumeMesocycleMode,
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

function phaseComputeFromDb(
  phases: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>["phases"],
  kindDefaults: PhaseKindZoneDefaults
): SimplePhaseCompute[] {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((phase) => phase.weekCount > 0)
    .map((phase) => {
      const hasStoredStart = phase.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? phase.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + phase.weekCount - 1;
      if (!hasStoredStart) cursor += phase.weekCount;
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      return {
        id: phase.id,
        startWeekIndex,
        endWeekIndex,
        planningMode: phase.planningMode,
        phaseKind: phase.phaseKind,
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        swimIntenseDaysPerWeek: notes.swimIntenseDaysPerWeek,
        bikeIntenseDaysPerWeek: notes.bikeIntenseDaysPerWeek,
        runIntenseDaysPerWeek: notes.runIntenseDaysPerWeek,
        longRideStartMin: phase.longRideStartMin,
        longRideEndMin: phase.longRideEndMin,
        longRunStartMin: phase.longRunStartMin,
        longRunEndMin: phase.longRunEndMin,
        longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
        longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
        longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
        longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
        zoneSplits: resolvePhaseZoneSplits({
          phaseKind: phase.phaseKind,
          phaseZoneSplits: notes.zoneSplits,
          kindDefaults,
        }),
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        volumeMesocycleMode: phase.volumeMesocycleMode,
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
    });
}

function phaseKindsByWeekIndex(totalWeeks: number, phases: SimplePhaseCompute[]): PhaseKind[] {
  return Array.from({ length: totalWeeks }, (_, weekIndex) => {
    const phase = phases.find(
      (p) => weekIndex >= p.startWeekIndex && weekIndex <= p.endWeekIndex
    );
    return phase?.phaseKind ?? "BUILD";
  });
}

function seasonSplitPercents(plan: {
  swimSplitPercent?: number | null;
  bikeSplitPercent?: number | null;
  runSplitPercent?: number | null;
}) {
  return {
    swim: plan.swimSplitPercent ?? 33.33,
    bike: plan.bikeSplitPercent ?? 33.34,
    run: plan.runSplitPercent ?? 33.33,
  };
}

function weeksFromDb(
  weeks: {
    weekIndex: number;
    isDeLoadWeek: boolean;
    swimHours: number;
    bikeHours: number;
    runHours: number;
    totalHours: number;
    swimDistanceMeters: number | null;
    runDistanceMeters: number | null;
    zoneMinutes: unknown;
  }[]
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }> {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    isRestWeek: week.isDeLoadWeek,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    totalHours: week.totalHours,
    swimDistanceMeters: week.swimDistanceMeters,
    runDistanceMeters: week.runDistanceMeters,
    zoneMinutes: parseDisciplineZoneMinutes(week.zoneMinutes),
  }));
}

function zonePhaseSpansFromWrites(
  phases: SimplePhaseWrite[],
  kindDefaults: PhaseKindZoneDefaults
): ZonePhaseSpan[] {
  return phases
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .map((phase) => ({
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      rampEnabled: phase.rampEnabled,
      zoneSplits: resolvePhaseZoneSplits({
        phaseKind: phase.phaseKind,
        phaseZoneSplits: phase.zoneSplits,
        kindDefaults,
      }),
    }));
}

function zonePhaseSpansFromDb(
  phases: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>["phases"],
  kindDefaults: PhaseKindZoneDefaults
): ZonePhaseSpan[] {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((phase) => phase.weekCount > 0)
    .map((phase) => {
      const hasStoredStart = "startWeekIndex" in phase && phase.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? phase.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + phase.weekCount - 1;
      if (!hasStoredStart) cursor += phase.weekCount;
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      return {
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        zoneSplits: resolvePhaseZoneSplits({
          phaseKind: phase.phaseKind,
          phaseZoneSplits: notes.zoneSplits,
          kindDefaults,
        }),
      };
    });
}

function buildInitialWeeks(
  totalWeeks: number,
  defaults: SimpleRampDefaults,
  kindDefaults: PhaseKindZoneDefaults,
  deLoadStrategy: DeLoadStrategy,
  restVolumePercent: number
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }> {
  const weeks: SimpleWeekVolume[] = Array.from({ length: totalWeeks }, (_, weekIndex) => ({
    weekIndex,
    isRestWeek: false,
    swimHours: defaults.swim.startHours,
    bikeHours: defaults.bike.startHours,
    runHours: defaults.run.startHours,
    totalHours: roundHours(
      defaults.swim.startHours + defaults.bike.startHours + defaults.run.startHours
    ),
    swimDistanceMeters:
      defaults.swim.mode === "DISTANCE" ? defaults.swim.startDistanceMeters : null,
    runDistanceMeters:
      defaults.run.mode === "DISTANCE" ? defaults.run.startDistanceMeters : null,
  }));

  const volumeWeeks = recalculateSimpleVolumes(weeks, [], defaults, restVolumePercent);
  const zoneMinutesList = recalculateZoneMinutesFromSplits(
    volumeWeeks.map((week) => ({
      weekIndex: week.weekIndex,
      isRestWeek: week.isRestWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
    })),
    [],
    deLoadStrategy
  );

  return volumeWeeks.map((week, index) => ({
    ...week,
    zoneMinutes: zoneMinutesList[index]!,
  }));
}

function mergeWeekWrites(
  existingWeeks: Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }>,
  writes: SimpleWeekWrite[] | undefined,
  totalWeeks: number,
  defaults: SimpleRampDefaults
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }> {
  const byIndex = new Map<number, SimpleWeekWrite>();
  for (const write of writes ?? []) {
    byIndex.set(write.weekIndex, write);
  }

  const weeks: Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }> = [];
  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const write = byIndex.get(weekIndex);
    const prior = existingWeeks[weekIndex];
    const swimHours = write?.swimHours ?? prior?.swimHours ?? defaults.swim.startHours;
    const bikeHours = write?.bikeHours ?? prior?.bikeHours ?? defaults.bike.startHours;
    const runHours = write?.runHours ?? prior?.runHours ?? defaults.run.startHours;
    weeks.push({
      weekIndex,
      isRestWeek: write?.isRestWeek ?? prior?.isRestWeek ?? false,
      swimHours,
      bikeHours,
      runHours,
      totalHours: roundHours(swimHours + bikeHours + runHours),
      swimDistanceMeters: write?.swimDistanceMeters ?? prior?.swimDistanceMeters ?? null,
      runDistanceMeters: write?.runDistanceMeters ?? prior?.runDistanceMeters ?? null,
      zoneMinutes: prior?.zoneMinutes ?? {},
    });
  }
  return weeks;
}

function phaseVolumeSpansFromCompute(
  phases: SimplePhaseCompute[]
): PhaseVolumeSpan[] {
  return phases.map((phase) => ({
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    planningMode: phase.planningMode,
    phaseKind: phase.phaseKind,
    id: phase.id,
    rampEnabled: phase.rampEnabled,
    volumeMesocycleMode: phase.volumeMesocycleMode,
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

function recalculateWeeks(
  weeks: Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }>,
  zonePhaseSpans: ZonePhaseSpan[],
  phaseCompute: SimplePhaseCompute[],
  phasesWithBlocks: PhaseWithBlocks[],
  rampDefaults: SimpleRampDefaults,
  deLoadStrategy: DeLoadStrategy,
  restVolumePercent: number,
  seasonContext: {
    defaultPlanningMode: PlanningMode;
    seasonSplit: { swim: number; bike: number; run: number };
    longAnchors: { rideStart: number; ridePeak: number; runStart: number; runPeak: number };
    deLoadEveryNWeeks: number;
  },
  totalWeeks: number,
  catalog?: ZoneFocusCatalog,
  seasonAnchors?: { startHours: number; peakHours: number },
  longWeekFlags?: {
    longRideWeekFlags?: boolean[] | null;
    longRunWeekFlags?: boolean[] | null;
  }
): ComputedSimpleWeek[] {
  const rampPhaseSpans = zonePhaseSpans.map((span) => ({
    startWeekIndex: span.startWeekIndex,
    endWeekIndex: span.endWeekIndex,
    rampEnabled: span.rampEnabled,
  }));
  const volumeWeeks = recalculatePhaseAwareVolumes({
    weeks,
    phases: phaseVolumeSpansFromCompute(phaseCompute),
    rampPhaseSpans,
    defaults: rampDefaults,
    restVolumePercent,
    seasonDefaultPlanningMode: seasonContext.defaultPlanningMode,
    seasonAnchors: seasonAnchors ?? {
      startHours: roundHours(
        rampDefaults.swim.startHours +
          rampDefaults.bike.startHours +
          rampDefaults.run.startHours
      ),
      peakHours: roundHours(
        rampDefaults.swim.peakHours +
          rampDefaults.bike.peakHours +
          rampDefaults.run.peakHours
      ),
    },
    seasonSplit: seasonContext.seasonSplit,
  });

  return enrichSimpleSeasonWeeks({
    weeks: volumeWeeks,
    phases: phaseCompute,
    zonePhaseSpans,
    phasesWithBlocks,
    seasonDefaultPlanningMode: seasonContext.defaultPlanningMode,
    deLoadStrategy,
    catalog,
    seasonSplit: seasonContext.seasonSplit,
    longAnchors: seasonContext.longAnchors,
    phaseKindsByWeek: phaseKindsByWeekIndex(totalWeeks, phaseCompute),
    taperWeekIndices: [],
    deLoadEveryNWeeks: seasonContext.deLoadEveryNWeeks,
    longRideWeekFlags: longWeekFlags?.longRideWeekFlags,
    longRunWeekFlags: longWeekFlags?.longRunWeekFlags,
  });
}

function weekCreateData(
  seasonPlanId: string,
  startDate: Date,
  week: ComputedSimpleWeek
) {
  return {
    id: cuid(),
    seasonPlanId,
    weekIndex: week.weekIndex,
    weekStartDate: weekStartDateForIndex(startDate, week.weekIndex),
    isDeLoadWeek: week.isRestWeek,
    mesocycleId: week.mesocycleId,
    totalHours: week.totalHours,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    swimDistanceMeters: week.swimDistanceMeters,
    runDistanceMeters: week.runDistanceMeters,
    zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
    longSessionZoneMinutes: Object.keys(week.longSessionZoneMinutes).length
      ? (week.longSessionZoneMinutes as Prisma.InputJsonValue)
      : Prisma.DbNull,
    slotBudgets: week.slotBudgets as Prisma.InputJsonValue,
    zoneMinutesOverridden: false,
    swimSessions: 0,
    bikeSessions: 0,
    runSessions: 0,
    longRideMinutes: week.longRideMinutes,
    longRunMinutes: week.longRunMinutes,
  };
}

function buildPhasesWithBlocks(
  phaseDbRows: Array<{
    id: string;
    name: string;
    startWeekIndex: number;
    weekCount: number;
  }> | null,
  phaseWrites: SimplePhaseWrite[] | undefined,
  mesocycleLengthWeeks: number
): PhaseWithBlocks[] {
  if (!phaseDbRows?.length) return [];
  return buildPhaseBlocks({
    mesocycleLengthWeeks,
    phases: phaseDbRows
      .filter((p) => p.startWeekIndex >= 0 && p.weekCount > 0)
      .map((p) => {
        const write = phaseWrites?.find((w) => w.id === p.id);
        return {
          id: p.id,
          name: p.name,
          startWeekIndex: p.startWeekIndex,
          endWeekIndex: write?.endWeekIndex ?? p.startWeekIndex + p.weekCount - 1,
          phaseKind: write?.phaseKind ?? "BASE",
        };
      }),
  });
}

export async function createSimpleSeasonPlan(input: CreateSimpleSeasonInput) {
  const bounds = buildSeasonDateBounds(input.startDate, input.endDate);
  const overlapping = await findOverlappingSeasonPlans(
    input.athleteId,
    bounds.startDate,
    bounds.endDate
  );

  if (overlapping.length === 1 && !overlapping[0]!.setupComplete) {
    return updateSimpleSeasonPlan(input.athleteId, overlapping[0]!.id, {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      rampDefaults: input.rampDefaults,
      phaseKindZoneDefaults: input.phaseKindZoneDefaults,
      phases: [],
      recalculate: true,
      goalEvent: input.goalEvent,
      bGoalEvents: input.bGoalEvents,
      cGoalEvents: input.cGoalEvents,
    });
  }

  if (overlapping.length > 0) {
    throw new Error(formatSeasonOverlapError(overlapping));
  }

  const defaults = input.rampDefaults ?? defaultSimpleRampDefaults();
  const athlete = await db.athlete.findUnique({
    where: { id: input.athleteId },
    select: { phaseKindZoneDefaults: true },
  });
  const kindDefaults = resolvePhaseKindZoneDefaultsForNewSeason(
    input.phaseKindZoneDefaults,
    athlete?.phaseKindZoneDefaults
  );
  const rampFields = rampDefaultsToPlanFields(defaults);
  const deLoadStrategy: DeLoadStrategy = "VOLUME_ONLY";
  const defaultPlanningMode = input.defaultPlanningMode ?? "BY_DISCIPLINE";
  const initialMerged = buildInitialWeeks(
    bounds.totalWeeks,
    defaults,
    kindDefaults,
    deLoadStrategy,
    DEFAULT_REST_VOLUME_PERCENT
  );
  const computedWeeks = recalculateWeeks(
    initialMerged,
    [],
    [],
    [],
    defaults,
    deLoadStrategy,
    DEFAULT_REST_VOLUME_PERCENT,
    {
      defaultPlanningMode,
      seasonSplit: seasonSplitPercents({}),
      longAnchors: {
        rideStart: 60,
        ridePeak: 180,
        runStart: 30,
        runPeak: 90,
      },
      deLoadEveryNWeeks: 4,
    },
    bounds.totalWeeks,
    undefined,
    { startHours: rampFields.startHours, peakHours: rampFields.peakHours },
    {
      longRideWeekFlags: initialLongWeekFlags(bounds.totalWeeks),
      longRunWeekFlags: initialLongWeekFlags(bounds.totalWeeks),
    }
  );
  const status = deriveSeasonStatus(bounds.startDate, bounds.endDate);
  const seasonPlanId = cuid();

  return db.$transaction(async (tx) => {
    await tx.seasonPlan.create({
      data: {
        id: seasonPlanId,
        athleteId: input.athleteId,
        name: input.name,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        setupComplete: true,
        mesocycleLengthWeeks: 4,
        deLoadEveryNWeeks: 4,
        deLoadVolumePercent: DEFAULT_REST_VOLUME_PERCENT,
        deLoadStrategy,
        defaultPlanningMode,
        phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
          kindDefaults
        ) as Prisma.InputJsonValue,
        longRideWeekFlags: initialLongWeekFlags(bounds.totalWeeks),
        longRunWeekFlags: initialLongWeekFlags(bounds.totalWeeks),
        ...rampFields,
      },
    });

    for (const week of computedWeeks) {
      await tx.seasonWeek.create({
        data: weekCreateData(seasonPlanId, bounds.startDate, week),
      });
    }

    if (input.goalEvent || input.bGoalEvents?.length || input.cGoalEvents?.length) {
      await createGoalEventsWithCalendar(tx, {
        athleteId: input.athleteId,
        seasonPlanId,
        primary: input.goalEvent,
        bGoalEvents: input.bGoalEvents,
        cGoalEvents: input.cGoalEvents,
      });
    }

    return getSeasonPlanById(input.athleteId, seasonPlanId, tx);
  });
}

export async function updateSimpleSeasonPlan(
  athleteId: string,
  seasonPlanId: string,
  input: UpdateSimpleSeasonInput
) {
  const existing = await getSeasonPlanById(athleteId, seasonPlanId);
  if (!existing) {
    throw new Error("Season plan not found");
  }

  const startDate = input.startDate ?? calendarDateFromDb(existing.startDate);
  const endDate = input.endDate ?? calendarDateFromDb(existing.endDate);
  const bounds = buildSeasonDateBounds(startDate, endDate);
  await assertNoSeasonOverlap(athleteId, bounds.startDate, bounds.endDate, seasonPlanId);

  const defaults =
    input.rampDefaults ??
    resolveSimpleRampDefaults({
      startHours: existing.startHours,
      peakHours: existing.peakHours,
      maxRampPercent: existing.maxRampPercent,
      swimStartHours: existing.swimStartHours,
      swimPeakHours: existing.swimPeakHours,
      swimRampPercent: existing.swimRampPercent,
      bikeStartHours: existing.bikeStartHours,
      bikePeakHours: existing.bikePeakHours,
      bikeRampPercent: existing.bikeRampPercent,
      runStartHours: existing.runStartHours,
      runPeakHours: existing.runPeakHours,
      runRampPercent: existing.runRampPercent,
      swimSplitPercent: existing.swimSplitPercent,
      bikeSplitPercent: existing.bikeSplitPercent,
      runSplitPercent: existing.runSplitPercent,
      swimPlanningMode: existing.swimPlanningMode,
      runPlanningMode: existing.runPlanningMode,
      swimReferencePaceSeconds: existing.swimReferencePaceSeconds,
      runReferencePaceSeconds: existing.runReferencePaceSeconds,
      swimStartDistanceMeters: existing.swimStartDistanceMeters,
      swimPeakDistanceMeters: existing.swimPeakDistanceMeters,
      runStartDistanceMeters: existing.runStartDistanceMeters,
      runPeakDistanceMeters: existing.runPeakDistanceMeters,
    });

  const kindDefaults =
    input.phaseKindZoneDefaults ??
    parsePhaseKindZoneDefaults(
      (existing as { phaseKindZoneDefaults?: unknown }).phaseKindZoneDefaults
    );

  const rampFields = input.rampDefaults ? rampDefaultsToPlanFields(defaults) : undefined;
  const deLoadStrategy = existing.deLoadStrategy ?? "VOLUME_ONLY";
  const restVolumePercent =
    input.deLoadVolumePercent ?? existing.deLoadVolumePercent ?? DEFAULT_REST_VOLUME_PERCENT;

  let phaseWrites = input.phases;
  if (phaseWrites && bounds.totalWeeks !== existing.totalWeeks) {
    phaseWrites = fitSimplePhasesToTotalWeeks(
      phaseWrites.map((phase) => ({
        ...phase,
        goal: phase.goal ?? null,
        zoneSplits: phase.zoneSplits ?? null,
      })),
      bounds.totalWeeks
    );
  }
  const phaseDbRows = phaseWrites ? phaseWritesToDb(phaseWrites) : null;
  const zonePhaseSpans = phaseWrites
    ? zonePhaseSpansFromWrites(phaseWrites, kindDefaults)
    : zonePhaseSpansFromDb(existing.phases, kindDefaults);

  const defaultPlanningMode =
    input.defaultPlanningMode ??
    existing.defaultPlanningMode ??
    "BY_DISCIPLINE";
  const mesocycleLengthWeeks = existing.mesocycleLengthWeeks ?? 4;
  const seasonContext = {
    defaultPlanningMode,
    seasonSplit: seasonSplitPercents(existing),
    longAnchors: {
      rideStart: existing.longRideStartMin,
      ridePeak: existing.longRidePeakMin,
      runStart: existing.longRunStartMin,
      runPeak: existing.longRunPeakMin,
    },
    deLoadEveryNWeeks: existing.deLoadEveryNWeeks ?? 4,
  };

  const phaseCompute = phaseWrites
    ? phaseComputeFromWrites(phaseWrites, kindDefaults)
    : phaseComputeFromDb(existing.phases, kindDefaults);

  const resolvedLongRideWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: bounds.totalWeeks,
    stored:
      input.longRideWeekFlags ??
      parseLongWeekFlags(existing.longRideWeekFlags) ??
      null,
  });
  const resolvedLongRunWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: bounds.totalWeeks,
    stored:
      input.longRunWeekFlags ??
      parseLongWeekFlags(existing.longRunWeekFlags) ??
      null,
  });
  const resolvedTestWeekFlags = resolveTestWeekFlagsForSeason({
    totalWeeks: bounds.totalWeeks,
    stored: input.testWeekFlags ?? existing.testWeekFlags ?? null,
  });

  const phaseDbRowsForBlocks =
    phaseDbRows ??
    existing.phases
      .filter((p) => p.weekCount > 0 && p.startWeekIndex >= 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        startWeekIndex: p.startWeekIndex,
        endWeekIndex: p.startWeekIndex + p.weekCount - 1,
      }));

  const phasesWithBlocks: PhaseWithBlocks[] = phaseDbRows
    ? buildPhasesWithBlocks(phaseDbRows, phaseWrites ?? undefined, mesocycleLengthWeeks)
    : existing.phases
        .filter((p) => p.mesocycles.length > 0)
        .map((phase) => ({
          phaseId: phase.id,
          phaseName: phase.name,
          startWeekIndex: phase.startWeekIndex,
          endWeekIndex: phase.startWeekIndex + phase.weekCount - 1,
          weekCount: phase.weekCount,
          blocks: phase.mesocycles.map((m) => ({
            id: m.id,
            phaseId: phase.id,
            name: m.name,
            index: m.index,
            startWeekIndex: m.startWeekIndex,
            endWeekIndex: m.endWeekIndex,
          })),
        }));

  let weeks: ComputedSimpleWeek[] = mergeWeekWrites(
    weeksFromDb(existing.weeks),
    input.weeks,
    bounds.totalWeeks,
    defaults
  ).map((week) => ({
    ...week,
    longSessionZoneMinutes: {},
    longRideMinutes: 0,
    longRunMinutes: 0,
    slotBudgets: {
      SWIM: { endurance: 0, intensity: 0, long: 0, substituteEndurance: 0, substituteDurationMinutes: 0 },
      BIKE: { endurance: 0, intensity: 0, long: 0, substituteEndurance: 0, substituteDurationMinutes: 0 },
      RUN: { endurance: 0, intensity: 0, long: 0, substituteEndurance: 0, substituteDurationMinutes: 0 },
    },
    mesocycleId: null,
    planningMode: defaultPlanningMode,
  }));

  if (input.recalculate) {
    const catalog = await loadAthleteZoneFocusCatalog(athleteId);
    weeks = recalculateWeeks(
      weeks,
      zonePhaseSpans,
      phaseCompute,
      phasesWithBlocks,
      defaults,
      deLoadStrategy,
      restVolumePercent,
      seasonContext,
      bounds.totalWeeks,
      catalog,
      { startHours: existing.startHours, peakHours: existing.peakHours },
      {
        longRideWeekFlags: resolvedLongRideWeekFlags,
        longRunWeekFlags: resolvedLongRunWeekFlags,
      }
    );
  }

  const status =
    existing.status === "ARCHIVED"
      ? "ARCHIVED"
      : deriveSeasonStatus(bounds.startDate, bounds.endDate);

  return db.$transaction(async (tx) => {
    if (phaseDbRows) {
      await tx.seasonPhaseDiscipline.deleteMany({
        where: { phase: { seasonPlanId } },
      });
      await tx.seasonMesocycle.deleteMany({
        where: { phase: { seasonPlanId } },
      });
      await tx.seasonPhase.deleteMany({ where: { seasonPlanId } });
    }

    await tx.seasonWeek.deleteMany({ where: { seasonPlanId } });

    await tx.seasonPlan.update({
      where: { id: seasonPlanId },
      data: {
        name: input.name ?? existing.name,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        setupComplete: true,
        ...(rampFields ?? {}),
        ...(input.deLoadVolumePercent != null
          ? { deLoadVolumePercent: input.deLoadVolumePercent }
          : {}),
        ...(input.phaseKindZoneDefaults
          ? {
              phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
                kindDefaults
              ) as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.defaultPlanningMode != null
          ? { defaultPlanningMode: input.defaultPlanningMode }
          : {}),
        ...(input.restWeekTemplateId !== undefined
          ? { restWeekTemplateId: input.restWeekTemplateId }
          : {}),
        ...(input.testWeekTemplateId !== undefined
          ? { testWeekTemplateId: input.testWeekTemplateId }
          : {}),
        longRideWeekFlags: resolvedLongRideWeekFlags,
        longRunWeekFlags: resolvedLongRunWeekFlags,
        testWeekFlags: resolvedTestWeekFlags,
      },
    });

    if (phaseDbRows) {
      for (const phase of phaseDbRows) {
        const write = phaseWrites!.find((item) => item.id === phase.id || item.name === phase.name);
        await tx.seasonPhase.create({
          data: {
            id: phase.id,
            seasonPlanId,
            name: phase.name,
            sortOrder: phase.sortOrder,
            weekCount: phase.weekCount,
            startWeekIndex: phase.startWeekIndex,
            phaseKind: write?.phaseKind ?? "BASE",
            color: phase.color,
            coachNotes: phase.coachNotes,
            rampSwimEnabled: phase.rampSwimEnabled,
            rampBikeEnabled: phase.rampBikeEnabled,
            rampRunEnabled: phase.rampRunEnabled,
            swimSessionsPerWeek: phase.swimSessionsPerWeek,
            bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
            runSessionsPerWeek: phase.runSessionsPerWeek,
            weeklyTemplateId: phase.weeklyTemplateId ?? null,
            planningMode: phase.planningMode,
            longRideStartMin: phase.longRideStartMin,
            longRideEndMin: phase.longRideEndMin,
            longRunStartMin: phase.longRunStartMin,
            longRunEndMin: phase.longRunEndMin,
            longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
            longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
            longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
            longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
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
          },
        });
      }

      for (const phaseBlocks of phasesWithBlocks) {
        for (const block of phaseBlocks.blocks) {
          await tx.seasonMesocycle.create({
            data: {
              id: block.id,
              phaseId: phaseBlocks.phaseId,
              name: block.name,
              index: block.index,
              startWeekIndex: block.startWeekIndex,
              endWeekIndex: block.endWeekIndex,
            },
          });
        }
      }
    }

    for (const week of weeks) {
      await tx.seasonWeek.create({
        data: weekCreateData(seasonPlanId, bounds.startDate, week),
      });
    }

    if (input.goalEvent !== undefined) {
      await upsertPrimaryGoalEvent(tx, {
        athleteId,
        seasonPlanId,
        input: input.goalEvent,
        existingPrimaryId: existing.primaryGoalEventId,
      });
    }
    if (input.bGoalEvents !== undefined) {
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "B",
        inputs: input.bGoalEvents,
        existingIds: existing.goalEvents
          .filter((event) => event.priority === "B")
          .map((event) => event.id),
      });
    }
    if (input.cGoalEvents !== undefined) {
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "C",
        inputs: input.cGoalEvents,
        existingIds: existing.goalEvents
          .filter((event) => event.priority === "C")
          .map((event) => event.id),
      });
    }
    if (input.removedGoalEvents?.length) {
      await removeGoalEvents(tx, input.removedGoalEvents);
    }

    return getSeasonPlanById(athleteId, seasonPlanId, tx);
  });
}

export function serializeSimpleSeasonPlan(
  plan: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>
) {
  const defaults = resolveSimpleRampDefaults(plan);
  const phaseKindZoneDefaults = parsePhaseKindZoneDefaults(
    (plan as { phaseKindZoneDefaults?: unknown }).phaseKindZoneDefaults
  );
  let cursor = 0;
  const phases = [...plan.phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => {
      const hasStoredStart = "startWeekIndex" in phase && phase.startWeekIndex >= 0;
      const assigned = phase.weekCount > 0;
      const startWeekIndex = assigned
        ? hasStoredStart
          ? phase.startWeekIndex
          : cursor
        : -1;
      const endWeekIndex = assigned ? startWeekIndex + phase.weekCount - 1 : -1;
      if (assigned && !hasStoredStart) {
        cursor += phase.weekCount;
      }
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      return {
        id: phase.id,
        name: phase.name,
        color: phase.color,
        phaseKind: phase.phaseKind,
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        strengthSessionsPerWeek: notes.strengthSessionsPerWeek,
        swimIntenseDaysPerWeek: notes.swimIntenseDaysPerWeek,
        bikeIntenseDaysPerWeek: notes.bikeIntenseDaysPerWeek,
        runIntenseDaysPerWeek: notes.runIntenseDaysPerWeek,
        goal: notes.goal,
        zoneSplits: notes.zoneSplits,
        weeklyTemplateId: phase.weeklyTemplateId ?? null,
        planningMode: phase.planningMode,
        longRideStartMin: phase.longRideStartMin,
        longRideEndMin: phase.longRideEndMin,
        longRunStartMin: phase.longRunStartMin,
        longRunEndMin: phase.longRunEndMin,
        longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
        longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
        longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
        longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
        volumeMesocycleMode: phase.volumeMesocycleMode,
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
    });

  const longRideWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: plan.totalWeeks,
    stored: parseLongWeekFlags(plan.longRideWeekFlags),
  });
  const longRunWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: plan.totalWeeks,
    stored: parseLongWeekFlags(plan.longRunWeekFlags),
  });
  const testWeekFlags = resolveTestWeekFlagsForSeason({
    totalWeeks: plan.totalWeeks,
    stored: plan.testWeekFlags,
  });

  return {
    id: plan.id,
    name: plan.name,
    startDate: formatDateKey(plan.startDate),
    endDate: formatDateKey(plan.endDate),
    totalWeeks: plan.totalWeeks,
    status: plan.status,
    defaultPlanningMode: plan.defaultPlanningMode,
    deLoadVolumePercent: plan.deLoadVolumePercent ?? DEFAULT_REST_VOLUME_PERCENT,
    rampDefaults: defaults,
    phaseKindZoneDefaults,
    restWeekTemplateId: plan.restWeekTemplateId ?? null,
    testWeekTemplateId: plan.testWeekTemplateId ?? null,
    longRideWeekFlags,
    longRunWeekFlags,
    testWeekFlags,
    longAnchors: {
      rideStart: plan.longRideStartMin,
      ridePeak: plan.longRidePeakMin,
      runStart: plan.longRunStartMin,
      runPeak: plan.longRunPeakMin,
    },
    phases,
    weeks: plan.weeks.map((week) => ({
      weekIndex: week.weekIndex,
      weekStartDate: formatDateKey(week.weekStartDate),
      isRestWeek: week.isDeLoadWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
      totalHours: week.totalHours,
      swimDistanceMeters: week.swimDistanceMeters,
      runDistanceMeters: week.runDistanceMeters,
      zoneMinutes: parseDisciplineZoneMinutes(week.zoneMinutes),
      longRideMinutes: week.longRideMinutes,
      longRunMinutes: week.longRunMinutes,
      longSessionZoneMinutes: parseDisciplineZoneMinutes(week.longSessionZoneMinutes),
      slotBudgets: week.slotBudgets,
    })),
    goalEvents: plan.goalEvents.map((event) => ({
      id: event.id,
      name: event.name,
      date: formatDateKey(event.date),
      disciplines: event.disciplines,
      priority: event.priority,
    })),
    primaryGoalEvent: plan.primaryGoalEvent
      ? {
          id: plan.primaryGoalEvent.id,
          name: plan.primaryGoalEvent.name,
          date: formatDateKey(plan.primaryGoalEvent.date),
          disciplines: plan.primaryGoalEvent.disciplines,
          priority: plan.primaryGoalEvent.priority,
        }
      : null,
  };
}

export type SimpleSeasonSummary = SeasonPlanSummary;
