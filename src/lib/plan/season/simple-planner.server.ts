import { Prisma, type DeLoadStrategy, type PhaseKind } from "@prisma/client";
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
import { fitSimplePhasesToTotalWeeks } from "./phase-span-utils";
import {
  parsePhaseKindZoneDefaults,
  resolvePhaseKindZoneDefaultsForNewSeason,
  resolvePhaseZoneSplits,
  serializePhaseKindZoneDefaults,
} from "./phase-zone-defaults";
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
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
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
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type UpdateSimpleSeasonInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  rampDefaults?: SimpleRampDefaults;
  phaseKindZoneDefaults?: PhaseKindZoneDefaults;
  phases?: SimplePhaseWrite[];
  weeks?: SimpleWeekWrite[];
  recalculate?: boolean;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
  removedGoalEvents?: RemovedGoalEventInput[];
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
  deLoadStrategy: DeLoadStrategy
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

  const volumeWeeks = recalculateSimpleVolumes(weeks, [], defaults);
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

function recalculateWeeks(
  weeks: Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes }>,
  zonePhaseSpans: ZonePhaseSpan[],
  rampDefaults: SimpleRampDefaults,
  deLoadStrategy: DeLoadStrategy
) {
  const volumeWeeks = recalculateSimpleVolumes(weeks, zonePhaseSpans, rampDefaults);
  const zoneMinutesList = recalculateZoneMinutesFromSplits(
    volumeWeeks.map((week) => ({
      weekIndex: week.weekIndex,
      isRestWeek: week.isRestWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
    })),
    zonePhaseSpans,
    deLoadStrategy
  );

  return volumeWeeks.map((week, index) => ({
    ...week,
    zoneMinutes: zoneMinutesList[index]!,
  }));
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
  const computedWeeks = buildInitialWeeks(
    bounds.totalWeeks,
    defaults,
    kindDefaults,
    deLoadStrategy
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
        deLoadVolumePercent: 60,
        deLoadStrategy,
        phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
          kindDefaults
        ) as Prisma.InputJsonValue,
        ...rampFields,
      },
    });

    for (const week of computedWeeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: weekStartDateForIndex(bounds.startDate, week.weekIndex),
          isDeLoadWeek: week.isRestWeek,
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          swimDistanceMeters: week.swimDistanceMeters,
          runDistanceMeters: week.runDistanceMeters,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          zoneMinutesOverridden: false,
          swimSessions: 0,
          bikeSessions: 0,
          runSessions: 0,
          longRideMinutes: 0,
          longRunMinutes: 0,
        },
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

    return getSeasonPlanById(input.athleteId, seasonPlanId);
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

  let weeks = mergeWeekWrites(
    weeksFromDb(existing.weeks),
    input.weeks,
    bounds.totalWeeks,
    defaults
  );

  if (input.recalculate) {
    weeks = recalculateWeeks(weeks, zonePhaseSpans, defaults, deLoadStrategy);
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
        ...(input.phaseKindZoneDefaults
          ? {
              phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
                kindDefaults
              ) as Prisma.InputJsonValue,
            }
          : {}),
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
          },
        });
      }
    }

    for (const week of weeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: weekStartDateForIndex(bounds.startDate, week.weekIndex),
          isDeLoadWeek: week.isRestWeek,
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          swimDistanceMeters: week.swimDistanceMeters,
          runDistanceMeters: week.runDistanceMeters,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          zoneMinutesOverridden: false,
          swimSessions: 0,
          bikeSessions: 0,
          runSessions: 0,
          longRideMinutes: 0,
          longRunMinutes: 0,
        },
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

    return getSeasonPlanById(athleteId, seasonPlanId);
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
      };
    });

  return {
    id: plan.id,
    name: plan.name,
    startDate: formatDateKey(plan.startDate),
    endDate: formatDateKey(plan.endDate),
    totalWeeks: plan.totalWeeks,
    status: plan.status,
    rampDefaults: defaults,
    phaseKindZoneDefaults,
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
