import {
  type DeLoadStrategy,
  type GoalEventDiscipline,
  Prisma,
  type SeasonStatus,
  type SportTemplate,
} from "@prisma/client";
import { db } from "@/lib/db";
import { calendarDateFromDb } from "@/lib/dates";
import { defaultVolumeMesocycleMode } from "./phase-volume-ramp";
import { suggestPhasesForWeeks } from "./default-phases";
import {
  mesocycleLayoutFingerprint,
  parseDeLoadWeekFlags,
} from "./de-load-cadence";
import { parseLongWeekFlags } from "./long-session-schedule";
import { resolveMesocycles } from "./phase-split";
import { recomputeSeasonWeeks } from "./recompute";
import {
  buildSeasonDateBounds,
  deriveSeasonStatus,
  findOverlappingSeason,
  seasonRangesOverlap,
} from "./season-dates";
import {
  createGoalEventsWithCalendar,
  linkCalendarRacesToPlan,
  removeGoalEvents,
  syncGoalEventsByPriority,
  upsertPrimaryGoalEvent,
  type GoalEventWriteInput,
  type LinkCalendarRaceInput,
  type RemovedGoalEventInput,
} from "./goal-events-sync";
import { findUnlinkedRaceSessions } from "@/lib/plan/race-calendar-sync";
import type { SeasonPhaseInput, SeasonPlanComputeInput } from "./types";

export type { GoalEventWriteInput };

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export type CreateSeasonPlanInput = {
  athleteId: string;
  name: string;
  sportTemplate?: SportTemplate;
  startDate: Date;
  endDate: Date;
  mesocycleLengthWeeks?: number;
  startHours: number;
  peakHours: number;
  maxRampPercent?: number;
  deLoadEveryNWeeks?: number;
  deLoadWeekFlags?: boolean[] | null;
  deLoadVolumePercent?: number;
  deLoadStrategy?: DeLoadStrategy;
  reduceCountsOnDeLoad?: boolean;
  deLoadCountScalePercent?: number | null;
  longRideStartMin?: number;
  longRidePeakMin?: number;
  longRunStartMin?: number;
  longRunPeakMin?: number;
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
  phases: SeasonPhaseInput[];
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type SeasonPlanSummary = {
  id: string;
  name: string;
  status: SeasonStatus;
  totalWeeks: number;
  startDate: Date;
  endDate: Date;
  totalPlannedHours: number;
};

export type UpdateSeasonPlanInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  sportTemplate?: SportTemplate;
  mesocycleLengthWeeks?: number;
  startHours?: number;
  peakHours?: number;
  maxRampPercent?: number;
  deLoadEveryNWeeks?: number;
  deLoadWeekFlags?: boolean[] | null;
  deLoadVolumePercent?: number;
  deLoadStrategy?: DeLoadStrategy;
  reduceCountsOnDeLoad?: boolean;
  deLoadCountScalePercent?: number | null;
  longRideStartMin?: number;
  longRidePeakMin?: number;
  longRunStartMin?: number;
  longRunPeakMin?: number;
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
  phases?: SeasonPhaseInput[];
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
  removedGoalEvents?: RemovedGoalEventInput[];
  linkCalendarRaces?: LinkCalendarRaceInput[];
  setupComplete?: boolean;
};

export async function getCurrentSeasonPlan(athleteId: string) {
  const active = await db.seasonPlan.findFirst({
    where: { athleteId, status: "ACTIVE", setupComplete: true },
    orderBy: { startDate: "desc" },
    include: {
      primaryGoalEvent: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
      },
      weeks: { orderBy: { weekIndex: "asc" } },
      goalEvents: true,
    },
  });
  if (active) return active;

  return db.seasonPlan.findFirst({
    where: { athleteId, status: "DRAFT" },
    orderBy: { startDate: "asc" },
    include: {
      primaryGoalEvent: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
      },
      weeks: { orderBy: { weekIndex: "asc" } },
      goalEvents: true,
    },
  });
}

export async function hasSetupCompleteSeason(athleteId: string): Promise<boolean> {
  const count = await db.seasonPlan.count({
    where: { athleteId, setupComplete: true, status: { not: "ARCHIVED" } },
  });
  return count > 0;
}

export async function listSeasonPlansForAthlete(athleteId: string) {
  return db.seasonPlan.findMany({
    where: { athleteId, status: { not: "ARCHIVED" } },
    orderBy: { startDate: "desc" },
    include: {
      primaryGoalEvent: true,
      phases: { orderBy: { sortOrder: "asc" } },
      weeks: { select: { totalHours: true } },
    },
  });
}

export async function getSeasonPlanById(athleteId: string, seasonPlanId: string) {
  return db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
    include: {
      primaryGoalEvent: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
      },
      weeks: { orderBy: { weekIndex: "asc" } },
      goalEvents: true,
    },
  });
}

export async function assertNoSeasonOverlap(
  athleteId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonPlanId?: string
): Promise<void> {
  const existing = await db.seasonPlan.findMany({
    where: {
      athleteId,
      status: { not: "ARCHIVED" },
      ...(excludeSeasonPlanId ? { id: { not: excludeSeasonPlanId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true },
  });

  const candidate = {
    id: excludeSeasonPlanId,
    startDate,
    endDate,
  };

  const overlap = findOverlappingSeason(
    candidate,
    existing.map((s) => ({
      id: s.id,
      startDate: calendarDateFromDb(s.startDate),
      endDate: calendarDateFromDb(s.endDate),
    }))
  );

  if (overlap) {
    throw new Error("Season dates overlap an existing season for this athlete");
  }
}

type DbPhaseWithMesocycles = NonNullable<
  Awaited<ReturnType<typeof getSeasonPlanById>>
>["phases"][number];

function dbPhasesToSeasonInput(phases: DbPhaseWithMesocycles[]): SeasonPhaseInput[] {
  return phases.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sortOrder,
    weekCount: p.weekCount,
    phaseKind: p.phaseKind,
    color: p.color,
    coachNotes: p.coachNotes,
    focusMode: p.focusMode,
    phaseFocus: p.phaseFocus,
    disciplineFocuses: p.disciplines.map((d) => ({
      discipline: d.discipline,
      focus: d.focus,
    })),
    swimSessionsPerWeek: p.swimSessionsPerWeek,
    bikeSessionsPerWeek: p.bikeSessionsPerWeek,
    runSessionsPerWeek: p.runSessionsPerWeek,
    volumeMesocycleMode: p.volumeMesocycleMode,
    volumeStartHours: p.volumeStartHours,
    volumeEndHours: p.volumeEndHours,
    longRideStartMin: p.longRideStartMin,
    longRideEndMin: p.longRideEndMin,
    longRunStartMin: p.longRunStartMin,
    longRunEndMin: p.longRunEndMin,
    mesocycles: p.mesocycles?.map((m) => ({
      id: m.id,
      name: m.name,
      weekCount: m.endWeekIndex - m.startWeekIndex + 1,
    })),
  }));
}

function phaseVolumeData(phase: SeasonPhaseInput) {
  return {
    volumeMesocycleMode:
      phase.volumeMesocycleMode ?? defaultVolumeMesocycleMode(phase.phaseKind),
    volumeStartHours: phase.volumeStartHours ?? null,
    volumeEndHours: phase.volumeEndHours ?? null,
    longRideStartMin: phase.longRideStartMin ?? null,
    longRideEndMin: phase.longRideEndMin ?? null,
    longRunStartMin: phase.longRunStartMin ?? null,
    longRunEndMin: phase.longRunEndMin ?? null,
  };
}

function toComputeInput(
  plan: CreateSeasonPlanInput,
  bounds: ReturnType<typeof buildSeasonDateBounds>
): SeasonPlanComputeInput {
  return {
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    mesocycleLengthWeeks: plan.mesocycleLengthWeeks ?? 4,
    phases: plan.phases,
    startHours: plan.startHours,
    peakHours: plan.peakHours,
    maxRampPercent: plan.maxRampPercent ?? 10,
    deLoadEveryNWeeks: plan.deLoadEveryNWeeks ?? 4,
    deLoadWeekFlags: plan.deLoadWeekFlags ?? null,
    deLoadVolumePercent: plan.deLoadVolumePercent ?? 60,
    deLoadStrategy: plan.deLoadStrategy ?? "VOLUME_ONLY",
    reduceCountsOnDeLoad: plan.reduceCountsOnDeLoad ?? true,
    deLoadCountScalePercent: plan.deLoadCountScalePercent,
    longRideStartMin: plan.longRideStartMin ?? 60,
    longRidePeakMin: plan.longRidePeakMin ?? 180,
    longRunStartMin: plan.longRunStartMin ?? 30,
    longRunPeakMin: plan.longRunPeakMin ?? 90,
    longRideWeekFlags: plan.longRideWeekFlags ?? null,
    longRunWeekFlags: plan.longRunWeekFlags ?? null,
  };
}

export async function createSeasonPlan(input: CreateSeasonPlanInput) {
  const bounds = buildSeasonDateBounds(input.startDate, input.endDate);
  await assertNoSeasonOverlap(input.athleteId, bounds.startDate, bounds.endDate);

  const status = deriveSeasonStatus(bounds.startDate, bounds.endDate);
  const computed = recomputeSeasonWeeks(toComputeInput(input, bounds));
  const seasonPlanId = cuid();

  return db.$transaction(async (tx) => {
    const phaseIds = input.phases.map(() => cuid());
    const mesocycleIds = computed.mesocycles.map(() => cuid());

    await tx.seasonPlan.create({
      data: {
        id: seasonPlanId,
        athleteId: input.athleteId,
        name: input.name,
        sportTemplate: input.sportTemplate ?? "TRIATHLON",
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        mesocycleLengthWeeks: input.mesocycleLengthWeeks ?? 4,
        startHours: input.startHours,
        peakHours: input.peakHours,
        maxRampPercent: input.maxRampPercent ?? 10,
        deLoadEveryNWeeks: input.deLoadEveryNWeeks ?? 4,
        deLoadVolumePercent: input.deLoadVolumePercent ?? 60,
        deLoadStrategy: input.deLoadStrategy ?? "VOLUME_ONLY",
        reduceCountsOnDeLoad: input.reduceCountsOnDeLoad ?? true,
        deLoadCountScalePercent: input.deLoadCountScalePercent,
        longRideStartMin: input.longRideStartMin ?? 60,
        longRidePeakMin: input.longRidePeakMin ?? 180,
        longRunStartMin: input.longRunStartMin ?? 30,
        longRunPeakMin: input.longRunPeakMin ?? 90,
        setupComplete: false,
      },
    });

    for (let i = 0; i < input.phases.length; i++) {
      const phase = input.phases[i]!;
      const phaseId = phaseIds[i]!;
      await tx.seasonPhase.create({
        data: {
          id: phaseId,
          seasonPlanId,
          name: phase.name,
          sortOrder: phase.sortOrder,
          weekCount: phase.weekCount,
          phaseKind: phase.phaseKind,
          color: phase.color ?? "#38bdf8",
          coachNotes: phase.coachNotes,
          focusMode: phase.focusMode,
          phaseFocus: phase.phaseFocus,
          swimSessionsPerWeek: phase.swimSessionsPerWeek,
          bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
          runSessionsPerWeek: phase.runSessionsPerWeek,
          ...phaseVolumeData(phase),
          disciplines: phase.disciplineFocuses?.length
            ? {
                create: phase.disciplineFocuses.map((d) => ({
                  id: cuid(),
                  discipline: d.discipline,
                  focus: d.focus,
                })),
              }
            : undefined,
        },
      });
    }

    for (let i = 0; i < computed.mesocycles.length; i++) {
      const meso = computed.mesocycles[i]!;
      const phaseId = phaseIds[meso.phaseIndex]!;
      await tx.seasonMesocycle.create({
        data: {
          id: mesocycleIds[i]!,
          phaseId,
          name: meso.name,
          index: meso.index,
          startWeekIndex: meso.startWeekIndex,
          endWeekIndex: meso.endWeekIndex,
        },
      });
    }

    const mesocycleIdByWeek = new Map<number, string>();
    for (let i = 0; i < computed.mesocycles.length; i++) {
      const meso = computed.mesocycles[i]!;
      for (let w = meso.startWeekIndex; w <= meso.endWeekIndex; w++) {
        mesocycleIdByWeek.set(w, mesocycleIds[i]!);
      }
    }

    for (const week of computed.weeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: week.weekStartDate,
          isDeLoadWeek: week.isDeLoadWeek,
          mesocycleId: mesocycleIdByWeek.get(week.weekIndex),
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          swimSessions: week.swimSessions,
          bikeSessions: week.bikeSessions,
          runSessions: week.runSessions,
          longRideMinutes: week.longRideMinutes,
          longRunMinutes: week.longRunMinutes,
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

    return tx.seasonPlan.findUniqueOrThrow({
      where: { id: seasonPlanId },
      include: {
        primaryGoalEvent: true,
        phases: {
          orderBy: { sortOrder: "asc" },
          include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
        },
        weeks: { orderBy: { weekIndex: "asc" } },
        goalEvents: true,
      },
    });
  });
}

export async function updateSeasonPlan(
  athleteId: string,
  seasonPlanId: string,
  input: UpdateSeasonPlanInput
) {
  const existing = await db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
    include: {
      primaryGoalEvent: true,
      phases: {
        include: {
          disciplines: true,
          mesocycles: { orderBy: { index: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!existing) {
    throw new Error("Season plan not found");
  }

  const startDate = input.startDate ?? calendarDateFromDb(existing.startDate);
  const endDate = input.endDate ?? calendarDateFromDb(existing.endDate);
  const bounds = buildSeasonDateBounds(startDate, endDate);
  await assertNoSeasonOverlap(athleteId, bounds.startDate, bounds.endDate, seasonPlanId);

  const phases: SeasonPhaseInput[] =
    input.phases ??
    dbPhasesToSeasonInput(existing.phases);

  const mesocycleLengthWeeks =
    input.mesocycleLengthWeeks ?? existing.mesocycleLengthWeeks;

  const newMesocycles = resolveMesocycles(phases, mesocycleLengthWeeks);

  let deLoadWeekFlags: boolean[] | null =
    input.deLoadWeekFlags !== undefined
      ? input.deLoadWeekFlags
      : parseDeLoadWeekFlags(existing.deLoadWeekFlags);

  let longRideWeekFlags: boolean[] | null =
    input.longRideWeekFlags !== undefined
      ? input.longRideWeekFlags
      : parseLongWeekFlags(existing.longRideWeekFlags);

  let longRunWeekFlags: boolean[] | null =
    input.longRunWeekFlags !== undefined
      ? input.longRunWeekFlags
      : parseLongWeekFlags(existing.longRunWeekFlags);

  if (input.phases) {
    const existingMesocycles = resolveMesocycles(
      dbPhasesToSeasonInput(existing.phases),
      mesocycleLengthWeeks
    );
    if (
      mesocycleLayoutFingerprint(newMesocycles) !==
      mesocycleLayoutFingerprint(existingMesocycles)
    ) {
      deLoadWeekFlags = null;
      longRideWeekFlags = null;
      longRunWeekFlags = null;
    }
  }

  const computeInput: SeasonPlanComputeInput = {
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    mesocycleLengthWeeks,
    phases,
    startHours: input.startHours ?? existing.startHours,
    peakHours: input.peakHours ?? existing.peakHours,
    maxRampPercent: input.maxRampPercent ?? existing.maxRampPercent,
    deLoadEveryNWeeks: input.deLoadEveryNWeeks ?? existing.deLoadEveryNWeeks,
    deLoadWeekFlags,
    deLoadVolumePercent: input.deLoadVolumePercent ?? existing.deLoadVolumePercent,
    deLoadStrategy: input.deLoadStrategy ?? existing.deLoadStrategy,
    reduceCountsOnDeLoad:
      input.reduceCountsOnDeLoad ?? existing.reduceCountsOnDeLoad,
    deLoadCountScalePercent:
      input.deLoadCountScalePercent !== undefined
        ? input.deLoadCountScalePercent
        : existing.deLoadCountScalePercent,
    longRideStartMin: input.longRideStartMin ?? existing.longRideStartMin,
    longRidePeakMin: input.longRidePeakMin ?? existing.longRidePeakMin,
    longRunStartMin: input.longRunStartMin ?? existing.longRunStartMin,
    longRunPeakMin: input.longRunPeakMin ?? existing.longRunPeakMin,
    longRideWeekFlags,
    longRunWeekFlags,
  };

  const computed = recomputeSeasonWeeks(computeInput);
  const status =
    existing.status === "ARCHIVED"
      ? "ARCHIVED"
      : deriveSeasonStatus(bounds.startDate, bounds.endDate);

  return db.$transaction(async (tx) => {
    if (input.phases) {
      const keptPhaseIds = new Set(
        phases.map((p) => p.id).filter((id): id is string => Boolean(id))
      );
      const removedPhaseIds = existing.phases
        .map((p) => p.id)
        .filter((id) => !keptPhaseIds.has(id));
      if (removedPhaseIds.length > 0) {
        await tx.anchorWorkout.deleteMany({
          where: { athleteId, seasonPhaseId: { in: removedPhaseIds } },
        });
      }
    }

    await tx.seasonWeek.deleteMany({ where: { seasonPlanId } });
    await tx.seasonMesocycle.deleteMany({
      where: { phase: { seasonPlanId } },
    });
    await tx.seasonPhaseDiscipline.deleteMany({
      where: { phase: { seasonPlanId } },
    });
    await tx.seasonPhase.deleteMany({ where: { seasonPlanId } });

    const phaseIds = phases.map((p) => p.id ?? cuid());
    const mesocycleIds = computed.mesocycles.map(() => cuid());

    await tx.seasonPlan.update({
      where: { id: seasonPlanId },
      data: {
        name: input.name ?? existing.name,
        sportTemplate: input.sportTemplate ?? existing.sportTemplate,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        mesocycleLengthWeeks: computeInput.mesocycleLengthWeeks,
        startHours: computeInput.startHours,
        peakHours: computeInput.peakHours,
        maxRampPercent: computeInput.maxRampPercent,
        deLoadEveryNWeeks: computeInput.deLoadEveryNWeeks,
        deLoadWeekFlags:
          deLoadWeekFlags === null
            ? Prisma.DbNull
            : (deLoadWeekFlags as Prisma.InputJsonValue),
        deLoadVolumePercent: computeInput.deLoadVolumePercent,
        deLoadStrategy: computeInput.deLoadStrategy,
        reduceCountsOnDeLoad: computeInput.reduceCountsOnDeLoad,
        deLoadCountScalePercent: computeInput.deLoadCountScalePercent,
        longRideStartMin: computeInput.longRideStartMin,
        longRidePeakMin: computeInput.longRidePeakMin,
        longRunStartMin: computeInput.longRunStartMin,
        longRunPeakMin: computeInput.longRunPeakMin,
        longRideWeekFlags:
          longRideWeekFlags === null
            ? Prisma.DbNull
            : (longRideWeekFlags as Prisma.InputJsonValue),
        longRunWeekFlags:
          longRunWeekFlags === null
            ? Prisma.DbNull
            : (longRunWeekFlags as Prisma.InputJsonValue),
        setupComplete:
          input.setupComplete !== undefined
            ? input.setupComplete
            : existing.setupComplete,
      },
    });

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]!;
      const phaseId = phaseIds[i]!;
      await tx.seasonPhase.create({
        data: {
          id: phaseId,
          seasonPlanId,
          name: phase.name,
          sortOrder: phase.sortOrder,
          weekCount: phase.weekCount,
          phaseKind: phase.phaseKind,
          color: phase.color ?? "#38bdf8",
          coachNotes: phase.coachNotes,
          focusMode: phase.focusMode,
          phaseFocus: phase.phaseFocus,
          swimSessionsPerWeek: phase.swimSessionsPerWeek,
          bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
          runSessionsPerWeek: phase.runSessionsPerWeek,
          ...phaseVolumeData(phase),
          disciplines: phase.disciplineFocuses?.length
            ? {
                create: phase.disciplineFocuses.map((d) => ({
                  id: cuid(),
                  discipline: d.discipline,
                  focus: d.focus,
                })),
              }
            : undefined,
        },
      });
    }

    for (let i = 0; i < computed.mesocycles.length; i++) {
      const meso = computed.mesocycles[i]!;
      const phaseId = phaseIds[meso.phaseIndex]!;
      await tx.seasonMesocycle.create({
        data: {
          id: mesocycleIds[i]!,
          phaseId,
          name: meso.name,
          index: meso.index,
          startWeekIndex: meso.startWeekIndex,
          endWeekIndex: meso.endWeekIndex,
        },
      });
    }

    const mesocycleIdByWeek = new Map<number, string>();
    for (let i = 0; i < computed.mesocycles.length; i++) {
      const meso = computed.mesocycles[i]!;
      for (let w = meso.startWeekIndex; w <= meso.endWeekIndex; w++) {
        mesocycleIdByWeek.set(w, mesocycleIds[i]!);
      }
    }

    for (const week of computed.weeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: week.weekStartDate,
          isDeLoadWeek: week.isDeLoadWeek,
          mesocycleId: mesocycleIdByWeek.get(week.weekIndex),
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          swimSessions: week.swimSessions,
          bikeSessions: week.bikeSessions,
          runSessions: week.runSessions,
          longRideMinutes: week.longRideMinutes,
          longRunMinutes: week.longRunMinutes,
        },
      });
    }

    if (input.removedGoalEvents?.length) {
      await removeGoalEvents(tx, input.removedGoalEvents);
    }

    if (input.goalEvent) {
      await upsertPrimaryGoalEvent(tx, {
        athleteId,
        seasonPlanId,
        input: input.goalEvent,
        existingPrimaryId: existing.primaryGoalEventId,
      });
    }

    if (input.bGoalEvents !== undefined) {
      const existingB = await tx.goalEvent.findMany({
        where: { seasonPlanId, priority: "B" },
        select: { id: true },
      });
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "B",
        inputs: input.bGoalEvents,
        existingIds: existingB.map((e) => e.id),
      });
    }

    if (input.cGoalEvents !== undefined) {
      const existingC = await tx.goalEvent.findMany({
        where: { seasonPlanId, priority: "C" },
        select: { id: true },
      });
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "C",
        inputs: input.cGoalEvents,
        existingIds: existingC.map((e) => e.id),
      });
    }

    if (input.linkCalendarRaces?.length) {
      await linkCalendarRacesToPlan(tx, {
        athleteId,
        seasonPlanId,
        links: input.linkCalendarRaces,
      });
    }

    return tx.seasonPlan.findUniqueOrThrow({
      where: { id: seasonPlanId },
      include: {
        primaryGoalEvent: true,
        phases: {
          orderBy: { sortOrder: "asc" },
          include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
        },
        weeks: { orderBy: { weekIndex: "asc" } },
        goalEvents: true,
      },
    });
  });
}

export { suggestPhasesForWeeks };

export async function refreshSeasonPlanStatus(seasonPlanId: string) {
  const plan = await db.seasonPlan.findUniqueOrThrow({
    where: { id: seasonPlanId },
  });
  if (plan.status === "ARCHIVED") return plan;

  const next = deriveSeasonStatus(
    calendarDateFromDb(plan.startDate),
    calendarDateFromDb(plan.endDate)
  );
  if (next !== plan.status) {
    return db.seasonPlan.update({
      where: { id: seasonPlanId },
      data: { status: next },
    });
  }
  return plan;
}

export async function archiveSeasonPlan(athleteId: string, seasonPlanId: string) {
  const plan = await db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
  });
  if (!plan) {
    throw new Error("Season plan not found");
  }
  return db.seasonPlan.update({
    where: { id: seasonPlanId },
    data: { status: "ARCHIVED" },
  });
}

export function seasonPlanToSummary(plan: {
  id: string;
  name: string;
  status: SeasonStatus;
  totalWeeks: number;
  startDate: Date;
  endDate: Date;
  weeks?: { totalHours: number }[];
}): SeasonPlanSummary {
  const totalPlannedHours =
    plan.weeks?.reduce((sum, w) => sum + w.totalHours, 0) ?? 0;
  return {
    id: plan.id,
    name: plan.name,
    status: plan.status,
    totalWeeks: plan.totalWeeks,
    startDate: plan.startDate,
    endDate: plan.endDate,
    totalPlannedHours: Math.round(totalPlannedHours * 10) / 10,
  };
}

export { seasonRangesOverlap, recomputeSeasonWeeks };
