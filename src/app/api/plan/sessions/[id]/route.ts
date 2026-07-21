import { NextResponse } from "next/server";
import { z } from "zod";
import type { Discipline } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { parseDateKey, formatDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { parseWorkoutTree, serializeWorkoutTree } from "@/lib/workout/steps";
import {
  nullableMetric,
  planDisciplineSchema,
  planSessionCompletedMetricsSchema,
  planSessionMetricsSchema,
  sessionRoleSchema,
  stepsPayloadSchema,
} from "@/lib/plan/api-schemas";
import { validateCompletedZoneAllocation } from "@/lib/plan/session-completion";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { markFolderWorkoutCompleted } from "@/lib/workout/workout-folder-library";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const updateSchema = z
  .object({
    scheduledDate: z.string().regex(DATE_KEY).optional(),
    discipline: planDisciplineSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    targetZones: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
    sessionRole: sessionRoleSchema.optional(),
    steps: stepsPayloadSchema.optional(),
  })
  .merge(planSessionMetricsSchema)
  .merge(planSessionCompletedMetricsSchema);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const plannedSession = await db.plannedSession.findFirst({
    where: { id, athleteId },
    include: { structuredWorkout: true },
  });
  if (!plannedSession) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ session: plannedSession });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.plannedSession.findFirst({
    where: { id, athleteId },
    include: { structuredWorkout: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    scheduledDate,
    discipline,
    title,
    notes,
    targetZones,
    sessionRole,
    steps,
    distanceMeters,
    targetSpeedMps,
    targetPaceSeconds,
    poolSize,
    completedDurationMinutes,
    completedDistanceMeters,
    completedTargetSpeedMps,
    completedTargetPaceSeconds,
    completedZones,
    clearCompletedOverrides,
  } = parsed.data;
  const treeDoc =
    steps !== undefined ? serializeWorkoutTree(parseWorkoutTree(steps)) : undefined;
  const nextDiscipline = (discipline ?? existing.discipline) as Discipline;

  if (completedZones !== undefined && completedZones !== null) {
    const zoneError = validateCompletedZoneAllocation(
      completedZones as Partial<Record<number, number>>,
      completedDurationMinutes ??
        existing.completedDurationMinutes ??
        null
    );
    if (zoneError) {
      return NextResponse.json({ error: zoneError }, { status: 400 });
    }
  }

  const updated = await db.$transaction(async (tx) => {
    if (treeDoc !== undefined) {
      if (treeDoc.nodes.length > 0) {
        if (existing.structuredWorkout) {
          await tx.structuredWorkout.update({
            where: { id: existing.structuredWorkout.id },
            data: {
              steps: treeDoc as Prisma.InputJsonValue,
              discipline: (discipline ?? existing.discipline) as Discipline,
            },
          });
        } else {
          await tx.structuredWorkout.create({
            data: {
              athleteId,
              plannedSessionId: id,
              discipline: (discipline ?? existing.discipline) as Discipline,
              steps: treeDoc as Prisma.InputJsonValue,
            },
          });
        }
      } else if (existing.structuredWorkout) {
        await tx.structuredWorkout.delete({ where: { id: existing.structuredWorkout.id } });
      }
    }

    const finalTargetZones =
      targetZones !== undefined ? targetZones : existing.targetZones;
    const structuredStepsForZone =
      treeDoc !== undefined
        ? treeDoc.nodes.length > 0
          ? treeDoc
          : undefined
        : existing.structuredWorkout?.steps;
    const zoneAllocationMissing = computeZoneAllocationMissing(
      nextDiscipline,
      finalTargetZones,
      undefined,
      structuredStepsForZone
    );

    const scheduledDateUpdate: {
      scheduledDate?: Date;
      linkedActivityId?: null;
    } = {};
    if (scheduledDate !== undefined) {
      const nextDate = parseDateKey(scheduledDate);
      scheduledDateUpdate.scheduledDate = nextDate;
      if (formatDateKey(nextDate) !== formatDateKey(existing.scheduledDate)) {
        scheduledDateUpdate.linkedActivityId = null;
      }
    }

    const updated = await tx.plannedSession.update({
      where: { id },
      data: {
        ...scheduledDateUpdate,
        ...(discipline !== undefined ? { discipline: discipline as Discipline } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(sessionRole !== undefined ? { sessionRole } : {}),
        zoneAllocationMissing,
        ...(distanceMeters !== undefined
          ? { distanceMeters: nullableMetric(distanceMeters) ?? null }
          : {}),
        ...(targetSpeedMps !== undefined
          ? {
              targetSpeedMps:
                nextDiscipline === "BIKE" ? nullableMetric(targetSpeedMps) ?? null : null,
            }
          : discipline !== undefined && nextDiscipline !== "BIKE"
            ? { targetSpeedMps: null }
            : {}),
        ...(targetPaceSeconds !== undefined
          ? {
              targetPaceSeconds:
                nextDiscipline === "RUN" || nextDiscipline === "SWIM"
                  ? nullableMetric(targetPaceSeconds) ?? null
                  : null,
            }
          : discipline !== undefined && nextDiscipline === "BIKE"
            ? { targetPaceSeconds: null }
            : {}),
        ...(poolSize !== undefined
          ? { poolSize: nextDiscipline === "SWIM" ? poolSize : null }
          : discipline !== undefined && nextDiscipline !== "SWIM"
            ? { poolSize: null }
            : {}),
        ...(targetZones !== undefined
          ? { targetZones: targetZones === null ? Prisma.JsonNull : targetZones }
          : {}),
        ...(clearCompletedOverrides
          ? {
              completedDurationMinutes: null,
              completedDistanceMeters: null,
              completedTargetSpeedMps: null,
              completedTargetPaceSeconds: null,
              completedZones: Prisma.JsonNull,
            }
          : {}),
        ...(completedDurationMinutes !== undefined && !clearCompletedOverrides
          ? {
              completedDurationMinutes:
                nullableMetric(completedDurationMinutes) ?? null,
            }
          : {}),
        ...(completedDistanceMeters !== undefined && !clearCompletedOverrides
          ? {
              completedDistanceMeters:
                nullableMetric(completedDistanceMeters) ?? null,
            }
          : {}),
        ...(completedTargetSpeedMps !== undefined && !clearCompletedOverrides
          ? {
              completedTargetSpeedMps:
                nextDiscipline === "BIKE"
                  ? nullableMetric(completedTargetSpeedMps) ?? null
                  : null,
            }
          : {}),
        ...(completedTargetPaceSeconds !== undefined && !clearCompletedOverrides
          ? {
              completedTargetPaceSeconds:
                nextDiscipline === "RUN" || nextDiscipline === "SWIM"
                  ? nullableMetric(completedTargetPaceSeconds) ?? null
                  : null,
            }
          : {}),
        ...(completedZones !== undefined && !clearCompletedOverrides
          ? {
              completedZones:
                completedZones === null ? Prisma.JsonNull : completedZones,
            }
          : {}),
      },
      include: { structuredWorkout: true },
    });
    await markFolderWorkoutCompleted(tx, id);
    return updated;
  });

  if (
    sessionRole !== undefined &&
    sessionRole !== existing.sessionRole &&
    updated.linkedActivityId
  ) {
    await inngest.send({
      name: "activity/zones.compute",
      data: { activityId: updated.linkedActivityId },
    });
  }

  return NextResponse.json({ session: updated });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.plannedSession.findFirst({
    where: { id, athleteId },
    include: { structuredWorkout: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const linkedActivityId = existing.linkedActivityId;

  await db.$transaction(async (tx) => {
    if (existing.structuredWorkout) {
      await tx.structuredWorkout.delete({ where: { id: existing.structuredWorkout.id } });
    }
    await tx.plannedSession.delete({ where: { id } });
    if (linkedActivityId) {
      await tx.syncedActivity.delete({
        where: { id: linkedActivityId, athleteId },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
