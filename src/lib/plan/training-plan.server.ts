import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseDateKey } from "@/lib/dates";
import { requestTodayKey } from "@/lib/timezone";
import {
  MAX_PLANNED_SESSION_CSV_BYTES,
  parsePlannedSessionsCsv,
  type CsvImportRowError,
} from "@/lib/plan/csv-import";
import { loadCsvImportThresholds } from "@/lib/plan/csv-import.server";
import {
  buildDisciplineSettings,
  type DisciplineUnitSettings,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import {
  buildTrainingPlanDraft,
  deepCopyWorkoutSteps,
  resolveApplyWindow,
  schedulePlanSessions,
  TRAINING_PLAN_GAP_BLOCK_DAYS,
  type ApplyAnchorMode,
} from "@/lib/plan/training-plan";

export class TrainingPlanError extends Error {
  status: number;
  errors?: CsvImportRowError[];
  code?: string;

  constructor(
    message: string,
    status: number,
    options?: { errors?: CsvImportRowError[]; code?: string }
  ) {
    super(message);
    this.name = "TrainingPlanError";
    this.status = status;
    this.errors = options?.errors;
    this.code = options?.code;
  }
}

async function loadDisciplineSettings(
  athleteId: string
): Promise<Record<PlanDiscipline, DisciplineUnitSettings>> {
  const rows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
    select: { discipline: true, displayUnit: true, poolSize: true },
  });
  return buildDisciplineSettings(
    rows.map((row) => ({
      discipline: row.discipline,
      displayUnit: row.displayUnit,
      poolSize: row.poolSize as PoolSize | null,
    }))
  );
}

export type TrainingPlanListItem = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  sessionCount: number;
  anchorWeekday: string;
  createdAt: string;
  updatedAt: string;
};

export async function listTrainingPlans(
  athleteId: string
): Promise<TrainingPlanListItem[]> {
  const plans = await db.trainingPlan.findMany({
    where: { athleteId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      durationDays: true,
      sessionCount: true,
      anchorWeekday: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    durationDays: p.durationDays,
    sessionCount: p.sessionCount,
    anchorWeekday: p.anchorWeekday,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function createTrainingPlanFromCsv(
  athleteId: string,
  input: {
    name: string;
    description?: string | null;
    csvText: string;
    confirmLargeGaps?: boolean;
  }
): Promise<TrainingPlanListItem & { gapWarning: boolean; maxGapDays: number }> {
  const name = input.name.trim();
  if (!name) {
    throw new TrainingPlanError("Plan name is required", 400);
  }
  if (name.length > 120) {
    throw new TrainingPlanError("Plan name is too long (max 120 characters)", 400);
  }

  const byteLength = new TextEncoder().encode(input.csvText).byteLength;
  if (byteLength > MAX_PLANNED_SESSION_CSV_BYTES) {
    throw new TrainingPlanError(
      `CSV is too large (max ${MAX_PLANNED_SESSION_CSV_BYTES} bytes)`,
      400
    );
  }

  const [settings, thresholds] = await Promise.all([
    loadDisciplineSettings(athleteId),
    loadCsvImportThresholds(athleteId),
  ]);
  const parsed = parsePlannedSessionsCsv(input.csvText, settings, thresholds);
  if (!parsed.ok) {
    throw new TrainingPlanError("CSV validation failed", 400, {
      errors: parsed.errors,
    });
  }

  let draft;
  try {
    draft = buildTrainingPlanDraft(parsed.sessions);
  } catch (e) {
    throw new TrainingPlanError(
      e instanceof Error ? e.message : "Invalid plan",
      400
    );
  }

  if (draft.gapBlocked && !input.confirmLargeGaps) {
    throw new TrainingPlanError(
      `Plan has a gap of ${draft.maxGapDays} days between sessions (max ${TRAINING_PLAN_GAP_BLOCK_DAYS} without confirmation). Re-submit with confirmLargeGaps to save anyway.`,
      400,
      { code: "LARGE_GAP" }
    );
  }

  const existing = await db.trainingPlan.findFirst({
    where: { athleteId, name },
    select: { id: true },
  });
  if (existing) {
    throw new TrainingPlanError(
      `A training plan named "${name}" already exists`,
      409,
      { code: "NAME_TAKEN" }
    );
  }

  const created = await db.trainingPlan.create({
    data: {
      athleteId,
      name,
      description: input.description?.trim() || null,
      durationDays: draft.durationDays,
      sessionCount: draft.sessionCount,
      anchorWeekday: draft.anchorWeekday,
      sessions: {
        create: draft.sessions.map((s) => ({
          dayOffset: s.dayOffset,
          sortOrder: s.sortOrder,
          discipline: s.discipline,
          title: s.title,
          notes: s.notes,
          sessionRole: s.sessionRole,
          estimatedDurationMinutes: s.estimatedDurationMinutes,
          distanceMeters: s.distanceMeters,
          targetSpeedMps: s.targetSpeedMps,
          targetPaceSeconds: s.targetPaceSeconds,
          poolSize: s.poolSize,
          steps: s.steps
            ? (s.steps as unknown as Prisma.InputJsonValue)
            : undefined,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      durationDays: true,
      sessionCount: true,
      anchorWeekday: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    id: created.id,
    name: created.name,
    description: created.description,
    durationDays: created.durationDays,
    sessionCount: created.sessionCount,
    anchorWeekday: created.anchorWeekday,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    gapWarning: draft.gapWarning,
    maxGapDays: draft.maxGapDays,
  };
}

export async function deleteTrainingPlan(
  athleteId: string,
  planId: string
): Promise<void> {
  const plan = await db.trainingPlan.findFirst({
    where: { id: planId, athleteId },
    select: { id: true },
  });
  if (!plan) {
    throw new TrainingPlanError("Training plan not found", 404);
  }
  await db.trainingPlan.delete({ where: { id: planId } });
}

export type ApplyMode = "merge" | "replace";

export type ApplyPreview = {
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  truncateOffset: number;
  truncated: boolean;
  appliedDurationDays: number;
  sessionCount: number;
  existingPlanSessionCount: number;
  hasExistingPlanSessions: boolean;
};

export async function previewTrainingPlanApply(
  athleteId: string,
  planId: string,
  input: {
    anchorMode: ApplyAnchorMode;
    date: string;
    todayKey?: string;
  }
): Promise<ApplyPreview> {
  const plan = await db.trainingPlan.findFirst({
    where: { id: planId, athleteId },
    include: {
      sessions: {
        select: { dayOffset: true, sortOrder: true },
        orderBy: [{ dayOffset: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!plan) {
    throw new TrainingPlanError("Training plan not found", 404);
  }

  const todayKey = input.todayKey ?? (await requestTodayKey());
  let window;
  try {
    window = resolveApplyWindow({
      durationDays: plan.durationDays,
      anchorMode: input.anchorMode,
      date: input.date,
      todayKey,
    });
  } catch (e) {
    throw new TrainingPlanError(
      e instanceof Error ? e.message : "Invalid apply window",
      400
    );
  }

  const scheduled = schedulePlanSessions(plan.sessions, window);
  const rangeStart = parseDateKey(window.startDate);
  const rangeEnd = parseDateKey(window.endDate);

  const existingPlanSessionCount = await db.plannedSession.count({
    where: {
      athleteId,
      trainingPlanId: planId,
      scheduledDate: { gte: rangeStart, lte: rangeEnd },
    },
  });

  return {
    planId: plan.id,
    planName: plan.name,
    startDate: window.startDate,
    endDate: window.endDate,
    truncateOffset: window.truncateOffset,
    truncated: window.truncated,
    appliedDurationDays: window.appliedDurationDays,
    sessionCount: scheduled.length,
    existingPlanSessionCount,
    hasExistingPlanSessions: existingPlanSessionCount > 0,
  };
}

export async function applyTrainingPlan(
  athleteId: string,
  planId: string,
  input: {
    anchorMode: ApplyAnchorMode;
    date: string;
    mode: ApplyMode;
    todayKey?: string;
  }
): Promise<{
  created: number;
  removed: number;
  structured: number;
  preview: ApplyPreview;
}> {
  const plan = await db.trainingPlan.findFirst({
    where: { id: planId, athleteId },
    include: {
      sessions: {
        orderBy: [{ dayOffset: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!plan) {
    throw new TrainingPlanError("Training plan not found", 404);
  }

  const todayKey = input.todayKey ?? (await requestTodayKey());
  let window;
  try {
    window = resolveApplyWindow({
      durationDays: plan.durationDays,
      anchorMode: input.anchorMode,
      date: input.date,
      todayKey,
    });
  } catch (e) {
    throw new TrainingPlanError(
      e instanceof Error ? e.message : "Invalid apply window",
      400
    );
  }

  const scheduled = schedulePlanSessions(plan.sessions, window);
  const rangeStart = parseDateKey(window.startDate);
  const rangeEnd = parseDateKey(window.endDate);

  const existingPlanSessionCount = await db.plannedSession.count({
    where: {
      athleteId,
      trainingPlanId: planId,
      scheduledDate: { gte: rangeStart, lte: rangeEnd },
    },
  });

  const preview: ApplyPreview = {
    planId: plan.id,
    planName: plan.name,
    startDate: window.startDate,
    endDate: window.endDate,
    truncateOffset: window.truncateOffset,
    truncated: window.truncated,
    appliedDurationDays: window.appliedDurationDays,
    sessionCount: scheduled.length,
    existingPlanSessionCount,
    hasExistingPlanSessions: existingPlanSessionCount > 0,
  };

  const sessionByKey = new Map(
    plan.sessions.map((s) => [`${s.dayOffset}:${s.sortOrder}`, s])
  );

  let removed = 0;
  let structured = 0;

  await db.$transaction(async (tx) => {
    if (input.mode === "replace") {
      const deleted = await tx.plannedSession.deleteMany({
        where: {
          athleteId,
          trainingPlanId: planId,
          scheduledDate: { gte: rangeStart, lte: rangeEnd },
        },
      });
      removed = deleted.count;
    }

    for (const slot of scheduled) {
      const planSession = sessionByKey.get(
        `${slot.dayOffset}:${slot.sortOrder}`
      );
      if (!planSession) continue;

      const stepsCopy = deepCopyWorkoutSteps(planSession.steps);
      const zoneAllocationMissing = computeZoneAllocationMissing(
        planSession.discipline,
        null,
        planSession.estimatedDurationMinutes,
        stepsCopy
      );

      const created = await tx.plannedSession.create({
        data: {
          athleteId,
          scheduledDate: parseDateKey(slot.scheduledDateKey),
          discipline: planSession.discipline,
          title: planSession.title,
          notes: planSession.notes,
          sessionRole: planSession.sessionRole,
          estimatedDurationMinutes: planSession.estimatedDurationMinutes,
          distanceMeters: planSession.distanceMeters,
          targetSpeedMps: planSession.targetSpeedMps,
          targetPaceSeconds: planSession.targetPaceSeconds,
          poolSize: planSession.poolSize,
          zoneAllocationMissing,
          source: "PLAN",
          trainingPlanId: planId,
        },
      });

      if (stepsCopy) {
        await tx.structuredWorkout.create({
          data: {
            athleteId,
            plannedSessionId: created.id,
            discipline: planSession.discipline,
            steps: stepsCopy as unknown as Prisma.InputJsonValue,
          },
        });
        structured += 1;
      }
    }
  });

  return {
    created: scheduled.length,
    removed,
    structured,
    preview,
  };
}
