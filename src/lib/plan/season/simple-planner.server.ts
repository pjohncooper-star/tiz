import { Prisma, type PhaseKind } from "@prisma/client";
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
  buildPhaseSpansFromDb,
  defaultSimpleRampDefaults,
  rampDefaultsToPlanFields,
  recalculateSimpleVolumes,
  resolveSimpleRampDefaults,
  type SimpleDiscipline,
  type SimplePhaseSpan,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
} from "./simple-ramp";
import {
  defaultZoneRampDefaults,
  parseZoneRampDefaults,
  recalculateSimpleZoneMinutes,
  type SimpleWeekWithZones,
  type ZoneRampDefaultsByDiscipline,
} from "./simple-tiz";
import { parseTargetZones, type ZoneMinutes } from "@/lib/workout/steps";
import { roundHours } from "./volume-curve";

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export type SimplePhaseWrite = {
  id?: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: Record<SimpleDiscipline, boolean>;
  goal?: string | null;
};

export type SimpleWeekWrite = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  swimDistanceMeters?: number | null;
  runDistanceMeters?: number | null;
  zoneMinutes?: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
};

export type CreateSimpleSeasonInput = {
  athleteId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  rampDefaults?: SimpleRampDefaults;
  zoneRampDefaults?: ZoneRampDefaultsByDiscipline;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type UpdateSimpleSeasonInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  rampDefaults?: SimpleRampDefaults;
  zoneRampDefaults?: ZoneRampDefaultsByDiscipline;
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
        coachNotes: phase.goal?.trim() || null,
      };
    });
}

function toWeekWithZones(week: SimpleWeekVolume & {
  zoneMinutes?: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
}): SimpleWeekWithZones {
  return {
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    zoneMinutes: week.zoneMinutes ?? {},
    zoneMinutesOverridden: week.zoneMinutesOverridden,
  };
}

function buildInitialWeeks(
  totalWeeks: number,
  defaults: SimpleRampDefaults,
  zoneDefaults: ZoneRampDefaultsByDiscipline
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }> {
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
  const zoneWeeks = recalculateSimpleZoneMinutes(
    volumeWeeks.map((week) => toWeekWithZones(week)),
    [],
    zoneDefaults
  );

  return volumeWeeks.map((week, index) => ({
    ...week,
    zoneMinutes: zoneWeeks[index]!.zoneMinutes,
    zoneMinutesOverridden: false,
  }));
}

function mergeWeekWrites(
  existingWeeks: Array<
    SimpleWeekVolume & { zoneMinutes?: ZoneMinutes; zoneMinutesOverridden?: boolean }
  >,
  writes: SimpleWeekWrite[] | undefined,
  totalWeeks: number,
  defaults: SimpleRampDefaults
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }> {
  const byIndex = new Map<number, SimpleWeekWrite>();
  for (const write of writes ?? []) {
    byIndex.set(write.weekIndex, write);
  }

  const weeks: Array<
    SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }
  > = [];
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
      zoneMinutes: write?.zoneMinutes ?? prior?.zoneMinutes ?? {},
      zoneMinutesOverridden:
        write?.zoneMinutesOverridden ?? prior?.zoneMinutesOverridden ?? false,
    });
  }
  return weeks;
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
    zoneMinutesOverridden: boolean;
  }[]
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }> {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    isRestWeek: week.isDeLoadWeek,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    totalHours: week.totalHours,
    swimDistanceMeters: week.swimDistanceMeters,
    runDistanceMeters: week.runDistanceMeters,
    zoneMinutes: parseTargetZones(week.zoneMinutes),
    zoneMinutesOverridden: week.zoneMinutesOverridden,
  }));
}

function phaseSpansFromWrites(phases: SimplePhaseWrite[]): SimplePhaseSpan[] {
  return phases
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .map((phase) => ({
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      rampEnabled: phase.rampEnabled,
    }));
}

function defaultPhaseKind(_name: string): PhaseKind {
  return "BASE";
}

function recalculateWeeks(
  weeks: Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }>,
  phaseSpans: SimplePhaseSpan[],
  rampDefaults: SimpleRampDefaults,
  zoneRampDefaults: ZoneRampDefaultsByDiscipline
) {
  const volumeWeeks = recalculateSimpleVolumes(weeks, phaseSpans, rampDefaults);
  const zoneWeeks = recalculateSimpleZoneMinutes(
    volumeWeeks.map((week, index) => ({
      ...toWeekWithZones(week),
      zoneMinutes: weeks[index]!.zoneMinutes,
      zoneMinutesOverridden: weeks[index]!.zoneMinutesOverridden,
    })),
    phaseSpans,
    zoneRampDefaults
  );

  return volumeWeeks.map((week, index) => ({
    ...week,
    zoneMinutes: zoneWeeks[index]!.zoneMinutes,
    zoneMinutesOverridden: weeks[index]!.zoneMinutesOverridden,
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
      zoneRampDefaults: input.zoneRampDefaults,
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
  const zoneDefaults = input.zoneRampDefaults ?? defaultZoneRampDefaults();
  const rampFields = rampDefaultsToPlanFields(defaults);
  const computedWeeks = buildInitialWeeks(bounds.totalWeeks, defaults, zoneDefaults);
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
        zoneRampDefaultsByDiscipline: zoneDefaults as Prisma.InputJsonValue,
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
          zoneMinutesOverridden: week.zoneMinutesOverridden,
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

  const zoneDefaults =
    input.zoneRampDefaults ??
    parseZoneRampDefaults(existing.zoneRampDefaultsByDiscipline);

  const rampFields = input.rampDefaults ? rampDefaultsToPlanFields(defaults) : undefined;

  const phaseWrites = input.phases;
  const phaseDbRows = phaseWrites ? phaseWritesToDb(phaseWrites) : null;
  const phaseSpans = phaseWrites
    ? phaseSpansFromWrites(phaseWrites)
    : buildPhaseSpansFromDb(existing.phases);

  let weeks = mergeWeekWrites(
    weeksFromDb(existing.weeks),
    input.weeks,
    bounds.totalWeeks,
    defaults
  );

  if (input.recalculate) {
    weeks = recalculateWeeks(weeks, phaseSpans, defaults, zoneDefaults);
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
        ...(input.zoneRampDefaults
          ? { zoneRampDefaultsByDiscipline: zoneDefaults as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (phaseDbRows) {
      for (const phase of phaseDbRows) {
        await tx.seasonPhase.create({
          data: {
            id: phase.id,
            seasonPlanId,
            name: phase.name,
            sortOrder: phase.sortOrder,
            weekCount: phase.weekCount,
            startWeekIndex: phase.startWeekIndex,
            phaseKind: defaultPhaseKind(phase.name),
            color: phase.color,
            coachNotes: phase.coachNotes,
            rampSwimEnabled: phase.rampSwimEnabled,
            rampBikeEnabled: phase.rampBikeEnabled,
            rampRunEnabled: phase.rampRunEnabled,
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
          zoneMinutesOverridden: week.zoneMinutesOverridden,
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
  const zoneRampDefaults = parseZoneRampDefaults(plan.zoneRampDefaultsByDiscipline);
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
      return {
        id: phase.id,
        name: phase.name,
        color: phase.color,
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        goal: phase.coachNotes ?? null,
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
    zoneRampDefaults,
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
      zoneMinutes: parseTargetZones(week.zoneMinutes),
      zoneMinutesOverridden: week.zoneMinutesOverridden,
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
