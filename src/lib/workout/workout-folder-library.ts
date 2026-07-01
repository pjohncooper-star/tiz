import type { Discipline, Prisma, WorkoutFolderKind } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { hasSessionCompletionOverride } from "@/lib/plan/session-completion";
import { parseWorkoutTree, serializeWorkoutTree } from "@/lib/workout/steps";

export type FolderWorkoutSummary = {
  id: string;
  name: string;
  discipline: Discipline;
  sortOrder: number | null;
};

export type FolderTreeNode = {
  id: string;
  name: string;
  folderKind: WorkoutFolderKind;
  discipline: Discipline | null;
  sortOrder: number;
  parentFolderId: string | null;
  lastCompletedAt: string | null;
  lastCompletedTemplate: { id: string; name: string } | null;
  children: FolderTreeNode[];
  workouts: FolderWorkoutSummary[];
};

type FolderRow = {
  id: string;
  name: string;
  folderKind: WorkoutFolderKind;
  discipline: Discipline | null;
  sortOrder: number;
  parentFolderId: string | null;
  lastCompletedAt: Date | null;
  lastCompletedTemplate: { id: string; name: string } | null;
};

type TemplateRow = {
  id: string;
  folderId: string | null;
  name: string;
  discipline: Discipline;
  sortOrder: number | null;
};

export function buildFolderTree(
  folders: FolderRow[],
  templates: TemplateRow[]
): FolderTreeNode[] {
  const workoutsByFolder = new Map<string, FolderWorkoutSummary[]>();
  for (const t of templates) {
    if (!t.folderId) continue;
    const list = workoutsByFolder.get(t.folderId) ?? [];
    list.push({
      id: t.id,
      name: t.name,
      discipline: t.discipline,
      sortOrder: t.sortOrder,
    });
    workoutsByFolder.set(t.folderId, list);
  }

  for (const list of workoutsByFolder.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const nodes = new Map<string, FolderTreeNode>();
  for (const f of folders) {
    nodes.set(f.id, {
      id: f.id,
      name: f.name,
      folderKind: f.folderKind,
      discipline: f.discipline,
      sortOrder: f.sortOrder,
      parentFolderId: f.parentFolderId,
      lastCompletedAt: f.lastCompletedAt?.toISOString() ?? null,
      lastCompletedTemplate: f.lastCompletedTemplate,
      children: [],
      workouts: workoutsByFolder.get(f.id) ?? [],
    });
  }

  const roots: FolderTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentFolderId && nodes.has(node.parentFolderId)) {
      nodes.get(node.parentFolderId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: FolderTreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of list) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

export async function loadFolderTree(
  db: Pick<PrismaClient, "workoutFolder" | "workoutTemplate">,
  athleteId: string,
  discipline?: Discipline
) {
  const folders = await db.workoutFolder.findMany({
    where: { athleteId },
    orderBy: [{ parentFolderId: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      folderKind: true,
      discipline: true,
      sortOrder: true,
      parentFolderId: true,
      lastCompletedAt: true,
      lastCompletedTemplate: { select: { id: true, name: true } },
    },
  });

  const templates = await db.workoutTemplate.findMany({
    where: {
      athleteId,
      folderId: { not: null },
      ...(discipline ? { discipline } : {}),
    },
    select: {
      id: true,
      folderId: true,
      name: true,
      discipline: true,
      sortOrder: true,
    },
  });

  const filteredFolders =
    discipline == null
      ? folders
      : folders.filter(
          (f) =>
            f.discipline == null ||
            f.discipline === discipline ||
            templates.some((t) => t.folderId === f.id)
        );

  return buildFolderTree(filteredFolders, templates);
}

export async function nextSortOrder(
  db: Pick<PrismaClient, "workoutFolder" | "workoutTemplate">,
  athleteId: string,
  parentFolderId: string | null,
  kind: "folder" | "workout",
  folderId?: string
): Promise<number> {
  if (kind === "folder") {
    const max = await db.workoutFolder.aggregate({
      where: { athleteId, parentFolderId },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? -1) + 1;
  }
  const max = await db.workoutTemplate.aggregate({
    where: { athleteId, folderId: folderId! },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? -1) + 1;
}

export function serializeTemplateSteps(steps: unknown): Prisma.InputJsonValue {
  return serializeWorkoutTree(parseWorkoutTree(steps)) as Prisma.InputJsonValue;
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function markFolderWorkoutCompleted(tx: Tx, plannedSessionId: string) {
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

  const source = await tx.sessionWorkoutSource.findUnique({
    where: { plannedSessionId },
    select: { folderId: true, workoutTemplateId: true, sortOrder: true },
  });
  if (!source?.folderId) return;

  const folder = await tx.workoutFolder.findUnique({
    where: { id: source.folderId },
    select: { folderKind: true },
  });
  if (folder?.folderKind !== "PROGRESSION") return;

  await tx.workoutFolder.update({
    where: { id: source.folderId },
    data: {
      lastCompletedAt: new Date(),
      lastCompletedTemplateId: source.workoutTemplateId,
      lastCompletedSessionId: plannedSessionId,
    },
  });
}

export function folderBreadcrumb(
  tree: FolderTreeNode[],
  folderId: string,
  trail: string[] = []
): string[] | null {
  for (const node of tree) {
    const path = [...trail, node.name];
    if (node.id === folderId) return path;
    const found = folderBreadcrumb(node.children, folderId, path);
    if (found) return found;
  }
  return null;
}

export function findFolderInTree(
  tree: FolderTreeNode[],
  folderId: string
): FolderTreeNode | null {
  for (const node of tree) {
    if (node.id === folderId) return node;
    const found = findFolderInTree(node.children, folderId);
    if (found) return found;
  }
  return null;
}
