import type { WorkoutFolderKind } from "@prisma/client";
import type { WorkoutNode } from "@/lib/workout/workout-tree";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import { flattenLibraryTemplates, type PoolLibraryTemplate } from "@/lib/plan/calendar/pool-library";

/** Segment column folder kinds for the Build-tab component library. */
export const SEGMENT_FOLDER_KINDS = ["WARM_UP", "MAIN_SET", "COOL_DOWN"] as const;

export type SegmentFolderKind = (typeof SEGMENT_FOLDER_KINDS)[number];

export const SEGMENT_COLUMN_LABELS: Record<SegmentFolderKind, string> = {
  WARM_UP: "Warm-up",
  MAIN_SET: "Main set",
  COOL_DOWN: "Cool-down",
};

export type GraphSegment = {
  id: string;
  label: string;
  nodes: WorkoutNode[];
};

/** Deep-clone and concatenate segment trees into one assembled workout. */
export function mergeSegmentNodes(segments: GraphSegment[]): WorkoutNode[] {
  return segments.flatMap((segment) => structuredClone(segment.nodes));
}

export function isSegmentFolderKind(kind: WorkoutFolderKind): kind is SegmentFolderKind {
  return (SEGMENT_FOLDER_KINDS as readonly string[]).includes(kind);
}

/**
 * Templates for a Build-tab column.
 * Segment kinds list matching folders; MAIN_SET also includes LIBRARY + PROGRESSION
 * so existing full workouts remain usable until athletes create segment folders.
 */
export function templatesForSegmentColumn(
  tree: FolderTreeNode[],
  kind: SegmentFolderKind
): PoolLibraryTemplate[] {
  const all = flattenLibraryTemplates(tree);
  if (kind === "MAIN_SET") {
    return all.filter(
      (t) =>
        t.folderKind === "MAIN_SET" ||
        t.folderKind === "LIBRARY" ||
        t.folderKind === "PROGRESSION"
    );
  }
  return all.filter((t) => t.folderKind === kind);
}
