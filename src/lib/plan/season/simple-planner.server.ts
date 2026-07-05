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
  recalculateSimpleVolumes,
  resolveSimpleRampDefaults,
  type SimpleDiscipline,
  type SimplePhaseSpan,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
} from "./simple-ramp";
import { roundHours } from "./volume-curve";

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

const EMPTY_ZONE_MINUTES = {} as Prisma.InputJsonValue;

export type SimplePhaseWrite = {
  id?: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: Record<SimpleDiscipline, boolean>;
};

export type SimpleWeekWrite = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
};

export type CreateSimpleSeasonInput = {
  athleteId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  rampDefaults?: SimpleRampDefaults;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type UpdateSimpleSeasonInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  rampDefaults?: SimpleRampDefaults;
  phases?: SimplePhaseWrite[];
  weeks?: SimpleWeekWrite[];
  recalculate?: boolean;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
  removedGoalEvents?: RemovedGoalEventInput[];
};

function rampDefaultsToPlanFields(defaults: SimpleRampDefaults) {
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
  };
}

function phaseWritesToDb(phases: SimplePhaseWrite[]) {
  return [...phases]
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex)
    .map((phase, sortOrder) => ({
      id: phase.id ?? cuid(),
      name: phase.name.trim() || `Phase ${sortOrder + 1}`,
      sortOrder,
      weekCount: phase.endWeekIndex - phase.startWeekIndex + 1,
      startWeekIndex: phase.startWeekIndex,
      color: phase.color || "#38bdf8",
      rampSwimEnabled: phase.rampEnabled.swim,
      rampBikeEnabled: phase.rampEnabled.bike,
      rampRunEnabled: phase.rampEnabled.run,
    }));
}

function buildInitialWeeks(totalWeeks: number, defaults: SimpleRampDefaults): SimpleWeekVolume[] {
  const weeks: SimpleWeekVolume[] = Array.from({ length: totalWeeks }, (_, weekIndex) => ({
    weekIndex,
    isRestWeek: false,
    swimHours: defaults.swim.startHours,
    bikeHours: defaults.bike.startHours,
    runHours: defaults.run.startHours,
    totalHours: roundHours(
      defaults.swim.startHours + defaults.bike.startHours + defaults.run.startHours
    ),
  }));
  return recalculateSimpleVolumes(weeks, [], defaults);
}

function mergeWeekWrites(
  existingWeeks: SimpleWeekVolume[],
  writes: SimpleWeekWrite[] | undefined,
  totalWeeks: number,
  seasonStart: Date,
  defaults: SimpleRampDefaults
): SimpleWeekVolume[] {
  const byIndex = new Map<number, SimpleWeekWrite>();
  for (const write of writes ?? []) {
    byIndex.set(write.weekIndex, write);
  }

  const weeks: SimpleWeekVolume[] = [];
  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const write = byIndex.get(weekIndex);
    const prior = existingWeeks[weekIndex];
    weeks.push({
      weekIndex,
      isRestWeek: write?.isRestWeek ?? prior?.isRestWeek ?? false,
      swimHours: write?.swimHours ?? prior?.swimHours ?? defaults.swim.startHours,
      bikeHours: write?.bikeHours ?? prior?.bikeHours ?? defaults.bike.startHours,
      runHours: write?.runHours ?? prior?.runHours ?? defaults.run.startHours,
      totalHours: roundHours(
        (write?.swimHours ?? prior?.swimHours ?? defaults.swim.startHours) +
          (write?.bikeHours ?? prior?.bikeHours ?? defaults.bike.startHours) +
          (write?.runHours ?? prior?.runHours ?? defaults.run.startHours)
      ),
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
  }[]
): SimpleWeekVolume[] {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    isRestWeek: week.isDeLoadWeek,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    totalHours: week.totalHours,
  }));
}

function phaseSpansFromWrites(phases: SimplePhaseWrite[]): SimplePhaseSpan[] {
  return phases.map((phase) => ({
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    rampEnabled: phase.rampEnabled,
  }));
}

function defaultPhaseKind(_name: string): PhaseKind {
  return "BASE";
}

export async function createSimpleSeasonPlan(input: CreateSimpleSeasonInput) {
  const bounds = buildSeasonDateBounds(input.startDate, input.endDate);
  await assertNoSeasonOverlap(input.athleteId, bounds.startDate, bounds.endDate);

  const defaults = input.rampDefaults ?? defaultSimpleRampDefaults();
  const rampFields = rampDefaultsToPlanFields(defaults);
  const computedWeeks = buildInitialWeeks(bounds.totalWeeks, defaults);
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
          zoneMinutes: EMPTY_ZONE_MINUTES,
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
    });

  const rampFields = input.rampDefaults
    ? rampDefaultsToPlanFields(defaults)
    : undefined;

  const phaseWrites = input.phases;
  const phaseDbRows = phaseWrites ? phaseWritesToDb(phaseWrites) : null;
  const phaseSpans = phaseWrites
    ? phaseSpansFromWrites(phaseWrites)
    : buildPhaseSpansFromDb(existing.phases);

  let weeks = mergeWeekWrites(
    weeksFromDb(existing.weeks),
    input.weeks,
    bounds.totalWeeks,
    bounds.startDate,
    defaults
  );

  if (input.recalculate) {
    weeks = recalculateSimpleVolumes(weeks, phaseSpans, defaults);
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
            phaseKind: defaultPhaseKind(phase.name),
            color: phase.color,
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
          zoneMinutes: EMPTY_ZONE_MINUTES,
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
  let cursor = 0;
  const phases = [...plan.phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => {
      const startWeekIndex = cursor;
      const endWeekIndex = cursor + phase.weekCount - 1;
      cursor += phase.weekCount;
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
    phases,
    weeks: plan.weeks.map((week) => ({
      weekIndex: week.weekIndex,
      weekStartDate: formatDateKey(week.weekStartDate),
      isRestWeek: week.isDeLoadWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
      totalHours: week.totalHours,
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
