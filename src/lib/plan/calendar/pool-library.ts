import type { Discipline, WorkoutFolderKind } from "@prisma/client";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";

export type PoolLibraryTemplate = {
  templateId: string;
  folderId: string;
  folderName: string;
  folderKind: WorkoutFolderKind;
  name: string;
  discipline: Discipline;
  sortOrder: number | null;
};

/** Flatten folder tree into draggable library templates (folder order preserved). */
export function flattenLibraryTemplates(tree: FolderTreeNode[]): PoolLibraryTemplate[] {
  const out: PoolLibraryTemplate[] = [];

  function walk(nodes: FolderTreeNode[]) {
    for (const node of nodes) {
      for (const workout of node.workouts) {
        out.push({
          templateId: workout.id,
          folderId: node.id,
          folderName: node.name,
          folderKind: node.folderKind,
          name: workout.name,
          discipline: workout.discipline,
          sortOrder: workout.sortOrder,
        });
      }
      walk(node.children);
    }
  }

  walk(tree);
  return out;
}

export function libraryTemplateCount(tree: FolderTreeNode[]): number {
  return flattenLibraryTemplates(tree).length;
}
