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
import { resolveZonePercentsForWeek, type ZonePhaseSpan } from "@/lib/plan/season/zone-split";
import { weekStartDateForIndex } from "@/lib/plan/season/season-dates";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";

export type SeasonTrainingPlanAttachmentWrite = {
  trainingPlanId: string;
  anchorMode: ApplyAnchorMode;
  anchorDate: string;
  goalEventId?: string | null;
  pausedWeeks?: PausedWeek[];
} | null;

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
  };
}

export async function loadOverlayPlanSessions(input: {
  athleteId: string;
  trainingPlanId: string;
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
    throw new TrainingPlanError("Training plan not found", 404);
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
    });
  }
  return { sessions, window };
}

export function overlayComputedWeeksWithPlan<T extends OverlayWeekTarget>(
  weeks: T[],
  sessions: OverlayPlanSession[],
  zonePhaseSpans: ZonePhaseSpan[],
  catalog?: ZoneFocusCatalog
): T[] {
  return overlayPlanLoadOnWeeks(weeks, sessions, {
    zonePercentsForWeek: (weekIndex, discipline) =>
      resolveZonePercentsForWeek({
        weekIndex,
        phases: zonePhaseSpans,
        discipline,
        catalog,
      }),
  });
}

export async function syncSeasonTrainingPlanAttachment(input: {
  tx: Prisma.TransactionClient;
  athleteId: string;
  seasonPlanId: string;
  existing: {
    startDate: Date;
    endDate: Date;
    truncateOffset: number;
    trainingPlanId: string;
    anchorMode: string;
    anchorDate: Date;
    goalEventId: string | null;
    pausedWeeks: unknown;
  } | null;
  write: SeasonTrainingPlanAttachmentWrite | undefined;
  goalEvents: Array<{ id: string; date: Date }>;
  seasonStart: Date;
  weeks: Array<OverlayWeekTarget & { weekIndex: number }>;
  zonePhaseSpans: ZonePhaseSpan[];
  catalog?: ZoneFocusCatalog;
}): Promise<void> {
  const { tx, athleteId, seasonPlanId } = input;

  if (input.write === undefined && !input.existing) {
    return;
  }

  await tx.seasonTrainingPlanAttachment.deleteMany({ where: { seasonPlanId } });

  const nextWrite =
    input.write !== undefined ? input.write : attachmentWriteFromExisting(input);

  if (nextWrite === null) {
    if (input.existing) {
      await tx.plannedSession.deleteMany({
        where: {
          athleteId,
          trainingPlanId: input.existing.trainingPlanId,
          scheduledDate: {
            gte: input.existing.startDate,
            lte: input.existing.endDate,
          },
        },
      });
    }
    return;
  }

  const pausedWeeks = parsePausedWeeks(nextWrite.pausedWeeks ?? []);
  let anchorDate = nextWrite.anchorDate;
  if (nextWrite.goalEventId) {
    const event = input.goalEvents.find((row) => row.id === nextWrite.goalEventId);
    if (!event) {
      throw new TrainingPlanError("Linked race was not found", 400);
    }
    anchorDate = formatDateKey(event.date);
  }

  const todayKey = await requestTodayKey();
  const { sessions, window } = await loadOverlayPlanSessions({
    athleteId,
    trainingPlanId: nextWrite.trainingPlanId,
    anchorMode: nextWrite.anchorMode,
    anchorDate,
    pausedWeeks,
    todayKey,
    tx,
  });

  const datedWeeks = input.weeks.map((week) => ({
    ...week,
    weekStartDate:
      week.weekStartDate ||
      formatDateKey(weekStartDateForIndex(input.seasonStart, week.weekIndex)),
  }));
  const overlaid = overlayComputedWeeksWithPlan(
    datedWeeks,
    sessions,
    input.zonePhaseSpans,
    input.catalog
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
        totalHours: week.totalHours,
        zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
        slotBudgets: week.slotBudgets as Prisma.InputJsonValue,
      },
    });
  }

  await tx.seasonTrainingPlanAttachment.create({
    data: {
      seasonPlanId,
      trainingPlanId: nextWrite.trainingPlanId,
      anchorMode: nextWrite.anchorMode,
      anchorDate: parseDateKey(anchorDate),
      goalEventId: nextWrite.goalEventId ?? null,
      pausedWeeks: pausedWeeks as unknown as Prisma.InputJsonValue,
      startDate: parseDateKey(window.startDate),
      endDate: parseDateKey(window.endDate),
      truncateOffset: window.truncateOffset,
    },
  });

  await applyTrainingPlan(athleteId, nextWrite.trainingPlanId, {
    anchorMode: nextWrite.anchorMode,
    date: anchorDate,
    mode: "replace",
    todayKey,
    pausedWeeks,
    tx,
    replaceRange: input.existing
      ? {
          startDate: formatDateKey(input.existing.startDate),
          endDate: formatDateKey(input.existing.endDate),
        }
      : undefined,
  });
}

function attachmentWriteFromExisting(input: {
  existing: {
    trainingPlanId: string;
    anchorMode: string;
    anchorDate: Date;
    goalEventId: string | null;
    pausedWeeks: unknown;
  } | null;
}): SeasonTrainingPlanAttachmentWrite {
  if (!input.existing) return null;
  return {
    trainingPlanId: input.existing.trainingPlanId,
    anchorMode: input.existing.anchorMode === "end" ? "end" : "start",
    anchorDate: formatDateKey(input.existing.anchorDate),
    goalEventId: input.existing.goalEventId,
    pausedWeeks: parsePausedWeeks(input.existing.pausedWeeks),
  };
}
