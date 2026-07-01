import type { Discipline, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseWorkoutTree, serializeWorkoutTree } from "@/lib/workout/steps";
import {
  mergePaletteIntoTree,
  recordSessionComponents,
  resolvePaletteItems,
  treeDocToPrismaJson,
  type PaletteApplyItem,
} from "@/lib/workout/component-library";

export async function applyWorkoutPaletteToSession(
  athleteId: string,
  sessionId: string,
  palette: PaletteApplyItem[]
) {
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

  const resolved = await resolvePaletteItems(db, athleteId, palette);
  for (const item of resolved) {
    const component = await db.workoutComponent.findFirst({
      where: { id: item.componentId, athleteId },
      select: { discipline: true },
    });
    if (!component) {
      throw new ApplyWorkoutError(`Component not found: ${item.componentId}`, 404);
    }
    if (component.discipline !== existing.discipline) {
      throw new ApplyWorkoutError("Component discipline does not match session", 400);
    }
  }

  const treeDoc = mergePaletteIntoTree(resolved.map((r) => r.nodes));
  const treeJson = treeDocToPrismaJson(treeDoc);

  return db.$transaction(async (tx) => {
    if (existing.source === "ANCHORED_INSTANCE" && existing.anchorWorkoutId) {
      await tx.plannedSession.update({
        where: { id: sessionId },
        data: { anchorWorkoutId: null, source: "FLEXIBLE" },
      });
    }

    if (existing.structuredWorkout) {
      await tx.structuredWorkout.update({
        where: { id: existing.structuredWorkout.id },
        data: {
          steps: treeJson,
          discipline: existing.discipline as Discipline,
        },
      });
    } else {
      await tx.structuredWorkout.create({
        data: {
          athleteId,
          plannedSessionId: sessionId,
          discipline: existing.discipline as Discipline,
          steps: treeJson,
        },
      });
    }

    await recordSessionComponents(tx, sessionId, palette);

    return tx.plannedSession.findFirst({
      where: { id: sessionId, athleteId },
      include: {
        structuredWorkout: true,
        sessionComponentInstances: {
          orderBy: { paletteOrderIndex: "asc" },
          include: {
            component: true,
            progressionStep: true,
          },
        },
      },
    });
  });
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

export function serializeComponentSteps(steps: unknown): Prisma.InputJsonValue {
  return serializeWorkoutTree(parseWorkoutTree(steps)) as Prisma.InputJsonValue;
}
