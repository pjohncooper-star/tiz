import type { Prisma } from "@prisma/client";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { requestTodayKey } from "@/lib/timezone";
import {
  parsePausedWeeks,
  resolveApplyWindowWithPauses,
  schedulePlanSessionsWithPauses,
  type ApplyAnchorMode,
  type PausedWeek,
} from "@/lib/plan/training-plan";
import {
  applyTrainingPlan,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";
import {
  overlayPlanLoadOnWeeks,
  type OverlayPlanSession,
  type OverlayWeekTarget,
} from "@/lib/plan/season/training-plan-overlay";
import {
  isDroppedPlanSession,
  parseFillLeftoverTiz,
  parseOwnsDisciplines,
  parsePlanSessionConflicts,
  type PlanSessionConflict,
  type ProgramDiscipline,
} from "@/lib/plan/season/plan-session-conflicts";
import { resolveZonePercentsForWeek, type ZonePhaseSpan } from "@/lib/plan/season/zone-split";
import { weekStartDateForIndex } from "@/lib/plan/season/season-dates";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";

export type SeasonTrainingPlanAttachmentWrite = {
  id?: string;
  trainingPlanId: string;
  anchorMode: ApplyAnchorMode;
  anchorDate: string;
  goalEventId?: string | null;
  pausedWeeks?: PausedWeek[];
  ownsDisciplines?: ProgramDiscipline[] | null;
  fillLeftoverTiz?: Partial<Record<ProgramDiscipline, boolean>>;
};

export type SerializedTrainingPlanAttachment = {
  id: string;
  trainingPlanId: string;
  trainingPlanName: string;
  durationDays: number;
  sessionCount: number;
  anchorMode: ApplyAnchorMode;
  anchorDate: string;
  goalEventId: string | null;
  pausedWeeks: PausedWeek[];
  startDate: string;
  endDate: string;
  truncateOffset: number;
  truncated: boolean;
  ownsDisciplines: ProgramDiscipline[] | null;
  fillLeftoverTiz: Partial<Record<ProgramDiscipline, boolean>>;
};

export function serializeTrainingPlanAttachment(
  row: {
    id: string;
    trainingPlanId: string;
    anchorMode: string;
    anchorDate: Date;
    goalEventId: string | null;
    pausedWeeks: unknown;
    startDate: Date;
    endDate: Date;
    truncateOffset: number;
    ownsDisciplines?: unknown;
    fillLeftoverTiz?: unknown;
    trainingPlan: { name: string; durationDays: number; sessionCount: number };
  }
): SerializedTrainingPlanAttachment {
  return {
    id: row.id,
    trainingPlanId: row.trainingPlanId,
    trainingPlanName: row.trainingPlan.name,
    durationDays: row.trainingPlan.durationDays,
    sessionCount: row.trainingPlan.sessionCount,
    anchorMode: row.anchorMode === "end" ? "end" : "start",
    anchorDate: formatDateKey(row.anchorDate),
    goalEventId: row.goalEventId,
    pausedWeeks: parsePausedWeeks(row.pausedWeeks),
    startDate: formatDateKey(row.startDate),
    endDate: formatDateKey(row.endDate),
    truncateOffset: row.truncateOffset,
    truncated: row.truncateOffset > 0,
    ownsDisciplines: parseOwnsDisciplines(row.ownsDisciplines),
    fillLeftoverTiz: parseFillLeftoverTiz(row.fillLeftoverTiz),
  };
}

export async function loadOverlayPlanSessions(input: {
  athleteId: string;
  trainingPlanId: string;
  attachmentId?: string;
  attachmentName?: string;
  anchorMode: ApplyAnchorMode;
  anchorDate: string;
  pausedWeeks: PausedWeek[];
  todayKey: string;
  tx?: Prisma.TransactionClient;
}): Promise<{
  sessions: OverlayPlanSession[];
  window: ReturnType<typeof resolveApplyWindowWithPauses>;
}> {
  const client = input.tx ?? db;
  const plan = await client.trainingPlan.findFirst({
    where: { id: input.trainingPlanId, athleteId: input.athleteId },
    include: {
      sessions: { orderBy: [{ dayOffset: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!plan) {
    throw new TrainingPlanError("Program not found", 404);
  }

  const window = resolveApplyWindowWithPauses({
    durationDays: plan.durationDays,
    anchorMode: input.anchorMode,
    date: input.anchorDate,
    todayKey: input.todayKey,
    pausedWeeks: input.pausedWeeks,
  });
  const scheduled = schedulePlanSessionsWithPauses(
    plan.sessions,
    window,
    window.pausedMondays
  );
  const byKey = new Map(
    plan.sessions.map((s) => [`${s.dayOffset}:${s.sortOrder}`, s])
  );
  const sessions: OverlayPlanSession[] = [];
  for (const slot of scheduled) {
    const planSession = byKey.get(`${slot.dayOffset}:${slot.sortOrder}`);
    if (!planSession) continue;
    sessions.push({
      scheduledDateKey: slot.scheduledDateKey,
      discipline: planSession.discipline,
      sessionRole: planSession.sessionRole,
      estimatedDurationMinutes: planSession.estimatedDurationMinutes,
      steps: planSession.steps,
      attachmentId: input.attachmentId,
      dayOffset: planSession.dayOffset,
      sortOrder: planSession.sortOrder,
      title: planSession.title,
    });
  }
  return { sessions, window };
}

export function overlayComputedWeeksWithPlan<T extends OverlayWeekTarget>(
  weeks: T[],
  sessions: OverlayPlanSession[],
  zonePhaseSpans: ZonePhaseSpan[],
  catalog?: ZoneFocusCatalog,
  options?: {
    conflicts?: PlanSessionConflict[];
    ownership?: Array<{
      attachmentId: string;
      owns: ProgramDiscipline[] | null;
      fillLeftoverTiz?: Partial<Record<ProgramDiscipline, boolean>>;
    }>;
  }
): T[] {
  return overlayPlanLoadOnWeeks(weeks, sessions, {
    zonePercentsForWeek: (weekIndex, discipline) =>
      resolveZonePercentsForWeek({
        weekIndex,
        phases: zonePhaseSpans,
        discipline,
        catalog,
      }),
    conflicts: options?.conflicts,
    ownership: options?.ownership,
  });
}

type ExistingAttachmentRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  truncateOffset: number;
  trainingPlanId: string;
  anchorMode: string;
  anchorDate: Date;
  goalEventId: string | null;
  pausedWeeks: unknown;
  ownsDisciplines?: unknown;
  fillLeftoverTiz?: unknown;
};

export async function syncSeasonTrainingPlanAttachments(input: {
  tx: Prisma.TransactionClient;
  athleteId: string;
  seasonPlanId: string;
  existing: ExistingAttachmentRow[];
  writes: SeasonTrainingPlanAttachmentWrite[] | null | undefined;
  conflicts?: PlanSessionConflict[] | undefined;
  maxWeekHours?: number | null | undefined;
  goalEvents: Array<{ id: string; date: Date }>;
  seasonStart: Date;
  weeks: Array<OverlayWeekTarget & { weekIndex: number }>;
  zonePhaseSpans: ZonePhaseSpan[];
  catalog?: ZoneFocusCatalog;
}): Promise<void> {
  const { tx, athleteId, seasonPlanId } = input;
  const existing = input.existing;

  if (input.writes === undefined && existing.length === 0 && input.conflicts === undefined) {
    return;
  }

  const writes: SeasonTrainingPlanAttachmentWrite[] =
    input.writes === undefined
      ? existing.map(attachmentWriteFromExisting)
      : input.writes ?? [];

  const writeIds = new Set(
    writes.map((row) => row.id).filter((id): id is string => Boolean(id))
  );
  const existingById = new Map(existing.map((row) => [row.id, row]));

  for (const row of existing) {
    if (writeIds.has(row.id)) continue;
    await tx.plannedSession.deleteMany({
      where: {
        athleteId,
        seasonTrainingPlanAttachmentId: row.id,
      },
    });
    await tx.seasonTrainingPlanAttachment.delete({ where: { id: row.id } });
  }

  if (writes.length === 0) {
    if (input.conflicts !== undefined) {
      await tx.seasonPlan.update({
        where: { id: seasonPlanId },
        data: { planSessionConflicts: [] as unknown as Prisma.InputJsonValue },
      });
    }
    return;
  }

  const todayKey = await requestTodayKey();
  const conflicts = parsePlanSessionConflicts(input.conflicts ?? []);
  const allSessions: OverlayPlanSession[] = [];
  const ownership: Array<{
    attachmentId: string;
    owns: ProgramDiscipline[] | null;
    fillLeftoverTiz?: Partial<Record<ProgramDiscipline, boolean>>;
  }> = [];

  const resolved: Array<{
    write: SeasonTrainingPlanAttachmentWrite;
    attachmentId: string;
    anchorDate: string;
    pausedWeeks: PausedWeek[];
    window: ReturnType<typeof resolveApplyWindowWithPauses>;
    previous: ExistingAttachmentRow | undefined;
  }> = [];

  for (const write of writes) {
    const pausedWeeks = parsePausedWeeks(write.pausedWeeks ?? []);
    let anchorDate = write.anchorDate;
    let goalEventId = write.goalEventId ?? null;
    if (goalEventId) {
      const event = input.goalEvents.find((row) => row.id === goalEventId);
      if (event) {
        anchorDate = formatDateKey(event.date);
      } else {
        goalEventId = null;
      }
    }

    const previous = write.id ? existingById.get(write.id) : undefined;
    const attachmentId = write.id ?? crypto.randomUUID();
    const resolvedWrite = { ...write, goalEventId };

    const loaded = await loadOverlayPlanSessions({
      athleteId,
      trainingPlanId: write.trainingPlanId,
      attachmentId,
      anchorMode: write.anchorMode,
      anchorDate,
      pausedWeeks,
      todayKey,
      tx,
    });

    allSessions.push(...loaded.sessions);
    ownership.push({
      attachmentId,
      owns: resolvedWrite.ownsDisciplines ?? parseOwnsDisciplines(previous?.ownsDisciplines) ?? null,
      fillLeftoverTiz: resolvedWrite.fillLeftoverTiz ?? parseFillLeftoverTiz(previous?.fillLeftoverTiz),
    });
    resolved.push({
      write: resolvedWrite,
      attachmentId,
      anchorDate,
      pausedWeeks,
      window: loaded.window,
      previous,
    });
  }

  const datedWeeks = input.weeks.map((week) => ({
    ...week,
    weekStartDate:
      week.weekStartDate ||
      formatDateKey(weekStartDateForIndex(input.seasonStart, week.weekIndex)),
  }));
  const overlaid = overlayComputedWeeksWithPlan(
    datedWeeks,
    allSessions,
    input.zonePhaseSpans,
    input.catalog,
    { conflicts, ownership }
  );

  for (const week of overlaid) {
    await tx.seasonWeek.update({
      where: {
        seasonPlanId_weekIndex: {
          seasonPlanId,
          weekIndex: week.weekIndex,
        },
      },
      data: {
        swimHours: week.swimHours,
        bikeHours: week.bikeHours,
        runHours: week.runHours,
        strengthHours: week.strengthHours ?? 0,
        strengthSessions: week.strengthSessions ?? 0,
        totalHours: week.totalHours,
        zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
        slotBudgets: week.slotBudgets as Prisma.InputJsonValue,
      },
    });
  }

  const planUpdate: Prisma.SeasonPlanUpdateInput = {};
  if (input.conflicts !== undefined) {
    planUpdate.planSessionConflicts = conflicts as unknown as Prisma.InputJsonValue;
  }
  if (input.maxWeekHours !== undefined) {
    planUpdate.maxWeekHours = input.maxWeekHours;
  }
  if (Object.keys(planUpdate).length > 0) {
    await tx.seasonPlan.update({
      where: { id: seasonPlanId },
      data: planUpdate,
    });
  }

  for (const row of resolved) {
    const owns =
      row.write.ownsDisciplines !== undefined
        ? row.write.ownsDisciplines
        : parseOwnsDisciplines(row.previous?.ownsDisciplines);
    const leftover =
      row.write.fillLeftoverTiz !== undefined
        ? row.write.fillLeftoverTiz
        : parseFillLeftoverTiz(row.previous?.fillLeftoverTiz);

    if (row.previous) {
      await tx.seasonTrainingPlanAttachment.update({
        where: { id: row.attachmentId },
        data: {
          trainingPlanId: row.write.trainingPlanId,
          anchorMode: row.write.anchorMode,
          anchorDate: parseDateKey(row.anchorDate),
          goalEventId: row.write.goalEventId ?? null,
          pausedWeeks: row.pausedWeeks as unknown as Prisma.InputJsonValue,
          ownsDisciplines: (owns ?? undefined) as Prisma.InputJsonValue | undefined,
          fillLeftoverTiz: leftover as unknown as Prisma.InputJsonValue,
          startDate: parseDateKey(row.window.startDate),
          endDate: parseDateKey(row.window.endDate),
          truncateOffset: row.window.truncateOffset,
        },
      });
    } else {
      await tx.seasonTrainingPlanAttachment.create({
        data: {
          id: row.attachmentId,
          seasonPlanId,
          trainingPlanId: row.write.trainingPlanId,
          anchorMode: row.write.anchorMode,
          anchorDate: parseDateKey(row.anchorDate),
          goalEventId: row.write.goalEventId ?? null,
          pausedWeeks: row.pausedWeeks as unknown as Prisma.InputJsonValue,
          ownsDisciplines: (owns ?? undefined) as Prisma.InputJsonValue | undefined,
          fillLeftoverTiz: leftover as unknown as Prisma.InputJsonValue,
          startDate: parseDateKey(row.window.startDate),
          endDate: parseDateKey(row.window.endDate),
          truncateOffset: row.window.truncateOffset,
        },
      });
    }

    const skipKeys = new Set(
      allSessions
        .filter(
          (session) =>
            session.attachmentId === row.attachmentId &&
            session.dayOffset != null &&
            session.sortOrder != null &&
            isDroppedPlanSession(
              conflicts,
              row.attachmentId,
              session.dayOffset,
              session.sortOrder
            )
        )
        .map((session) => `${session.dayOffset}:${session.sortOrder}`)
    );

    await applyTrainingPlan(athleteId, row.write.trainingPlanId, {
      anchorMode: row.write.anchorMode,
      date: row.anchorDate,
      mode: "replace",
      todayKey,
      pausedWeeks: row.pausedWeeks,
      tx,
      seasonTrainingPlanAttachmentId: row.attachmentId,
      skipSessionKeys: skipKeys,
      replaceRange: row.previous
        ? {
            startDate: formatDateKey(row.previous.startDate),
            endDate: formatDateKey(row.previous.endDate),
          }
        : undefined,
    });
  }
}

/** @deprecated Use syncSeasonTrainingPlanAttachments. */
export async function syncSeasonTrainingPlanAttachment(input: {
  tx: Prisma.TransactionClient;
  athleteId: string;
  seasonPlanId: string;
  existing: ExistingAttachmentRow | null;
  write: SeasonTrainingPlanAttachmentWrite | null | undefined;
  goalEvents: Array<{ id: string; date: Date }>;
  seasonStart: Date;
  weeks: Array<OverlayWeekTarget & { weekIndex: number }>;
  zonePhaseSpans: ZonePhaseSpan[];
  catalog?: ZoneFocusCatalog;
}): Promise<void> {
  await syncSeasonTrainingPlanAttachments({
    ...input,
    existing: input.existing ? [{ ...input.existing, id: input.existing.id ?? "" }] : [],
    writes: input.write === undefined ? undefined : input.write ? [input.write] : [],
  });
}

function attachmentWriteFromExisting(
  row: ExistingAttachmentRow
): SeasonTrainingPlanAttachmentWrite {
  return {
    id: row.id,
    trainingPlanId: row.trainingPlanId,
    anchorMode: row.anchorMode === "end" ? "end" : "start",
    anchorDate: formatDateKey(row.anchorDate),
    goalEventId: row.goalEventId,
    pausedWeeks: parsePausedWeeks(row.pausedWeeks),
    ownsDisciplines: parseOwnsDisciplines(row.ownsDisciplines),
    fillLeftoverTiz: parseFillLeftoverTiz(row.fillLeftoverTiz),
  };
}
