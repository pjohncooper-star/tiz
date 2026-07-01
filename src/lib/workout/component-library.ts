import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { hasSessionCompletionOverride } from "@/lib/plan/session-completion";
import {
  parseWorkoutTree,
  serializeWorkoutTree,
  WORKOUT_TREE_VERSION,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/steps";

export type ComponentStepsSource = {
  steps: unknown;
  progressionSteps?: { id: string; steps: unknown }[];
};

export type PaletteApplyItem = {
  componentId: string;
  progressionStepId?: string | null;
  orderIndex: number;
};

export type ResolvedPaletteItem = PaletteApplyItem & {
  nodes: WorkoutNode[];
  label: string;
};

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export function resolveComponentSteps(
  component: ComponentStepsSource,
  progressionStepId?: string | null
): WorkoutNode[] {
  if (progressionStepId) {
    const variant = component.progressionSteps?.find((p) => p.id === progressionStepId);
    if (variant) {
      return parseWorkoutTree(variant.steps).nodes;
    }
  }
  return parseWorkoutTree(component.steps).nodes;
}

export function progressionLabel(
  componentName: string,
  progressionStepId: string | null | undefined,
  progressionSteps: { id: string; label: string }[]
): string {
  if (!progressionStepId) return `${componentName} · base`;
  const step = progressionSteps.find((p) => p.id === progressionStepId);
  return step ? `${componentName} · ${step.label}` : componentName;
}

export function mergePaletteIntoTree(nodeGroups: WorkoutNode[][]): WorkoutTreeDocument {
  return {
    version: WORKOUT_TREE_VERSION,
    nodes: nodeGroups.flat(),
  };
}

export async function resolvePaletteItems(
  db: Pick<PrismaClient, "workoutComponent">,
  athleteId: string,
  palette: PaletteApplyItem[]
): Promise<ResolvedPaletteItem[]> {
  const sorted = [...palette].sort((a, b) => a.orderIndex - b.orderIndex);
  const resolved: ResolvedPaletteItem[] = [];

  for (const item of sorted) {
    const component = await db.workoutComponent.findFirst({
      where: { id: item.componentId, athleteId },
      include: { progressionSteps: { orderBy: { orderIndex: "asc" } } },
    });
    if (!component) {
      throw new Error(`Component not found: ${item.componentId}`);
    }
    const nodes = resolveComponentSteps(component, item.progressionStepId);
    resolved.push({
      ...item,
      nodes,
      label: progressionLabel(component.name, item.progressionStepId, component.progressionSteps),
    });
  }

  return resolved;
}

export async function recordSessionComponents(
  tx: Tx,
  plannedSessionId: string,
  palette: PaletteApplyItem[]
) {
  await tx.sessionComponentInstance.deleteMany({ where: { plannedSessionId } });
  if (palette.length === 0) return;

  await tx.sessionComponentInstance.createMany({
    data: palette.map((item) => ({
      plannedSessionId,
      componentId: item.componentId,
      progressionStepId: item.progressionStepId ?? null,
      paletteOrderIndex: item.orderIndex,
    })),
  });
}

export async function markComponentsCompleted(tx: Tx, plannedSessionId: string) {
  const session = await tx.plannedSession.findUnique({
    where: { id: plannedSessionId },
    select: {
      linkedActivityId: true,
      completedDurationMinutes: true,
      completedDistanceMeters: true,
      completedTargetSpeedMps: true,
      completedTargetPaceSeconds: true,
      completedZones: true,
    },
  });
  if (!session) return;

  const isComplete =
    !!session.linkedActivityId || hasSessionCompletionOverride(session);
  if (!isComplete) return;

  const instances = await tx.sessionComponentInstance.findMany({
    where: { plannedSessionId },
    select: { componentId: true },
  });
  if (instances.length === 0) return;

  const now = new Date();
  const componentIds = [...new Set(instances.map((i) => i.componentId))];
  await tx.workoutComponent.updateMany({
    where: { id: { in: componentIds } },
    data: {
      lastCompletedAt: now,
      lastCompletedSessionId: plannedSessionId,
    },
  });
}

export function treeDocToPrismaJson(tree: WorkoutTreeDocument): Prisma.InputJsonValue {
  return serializeWorkoutTree(tree) as Prisma.InputJsonValue;
}
