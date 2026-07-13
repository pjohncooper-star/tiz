import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { parseWorkoutTree } from "@/lib/workout/steps";
import { roleFromStructuredWorkout } from "@/lib/plan/session-role";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import { serializeTemplateSteps } from "@/lib/workout/workout-folder-library";

export async function applyWorkoutTemplateToSession(
  athleteId: string,
  sessionId: string,
  workoutTemplateId: string
) {
  const template = await db.workoutTemplate.findFirst({
    where: { id: workoutTemplateId, athleteId },
    include: { folder: { select: { id: true, folderKind: true } } },
  });
  if (!template) {
    throw new ApplyWorkoutError("Workout not found", 404);
  }
  if (!template.folderId) {
    throw new ApplyWorkoutError("Workout is not in the library", 400);
  }

  const existing = await db.plannedSession.findFirst({
    where: { id: sessionId, athleteId },
    include: { structuredWorkout: true },
  });
  if (!existing) {
    throw new ApplyWorkoutError("Session not found", 404);
  }
  if (existing.source === "RACE") {
    throw new ApplyWorkoutError("Cannot apply workout to a race session", 400);
  }
  if (template.discipline !== existing.discipline) {
    throw new ApplyWorkoutError("Workout discipline does not match session", 400);
  }

  const treeJson = serializeTemplateSteps(template.steps);

  return db.$transaction(async (tx) => {
    if (existing.structuredWorkout) {
      await tx.structuredWorkout.update({
        where: { id: existing.structuredWorkout.id },
        data: {
          steps: treeJson,
          discipline: existing.discipline as Discipline,
          sourceTemplateId: template.id,
        },
      });
    } else {
      await tx.structuredWorkout.create({
        data: {
          athleteId,
          plannedSessionId: sessionId,
          discipline: existing.discipline as Discipline,
          steps: treeJson,
          sourceTemplateId: template.id,
        },
      });
    }

    await tx.sessionWorkoutSource.upsert({
      where: { plannedSessionId: sessionId },
      create: {
        plannedSessionId: sessionId,
        folderId: template.folderId,
        workoutTemplateId: template.id,
        sortOrder: template.sortOrder,
      },
      update: {
        folderId: template.folderId,
        workoutTemplateId: template.id,
        sortOrder: template.sortOrder,
        appliedAt: new Date(),
      },
    });

    if (existing.sessionRole === "MODERATE") {
      const rollup = sessionPlannedZoneRollup(existing.discipline, {
        structuredSteps: treeJson,
      });
      const inferredRole = roleFromStructuredWorkout(rollup.zones, existing.discipline);
      if (inferredRole) {
        await tx.plannedSession.update({
          where: { id: sessionId },
          data: { sessionRole: inferredRole },
        });
      }
    }

    return tx.plannedSession.findFirst({
      where: { id: sessionId, athleteId },
      include: {
        structuredWorkout: true,
        workoutSource: {
          include: {
            folder: { select: { id: true, name: true, folderKind: true } },
            workoutTemplate: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });
  });
}

export function templateNodes(template: { steps: unknown }) {
  return parseWorkoutTree(template.steps).nodes;
}

export class ApplyWorkoutError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApplyWorkoutError";
  }
}
