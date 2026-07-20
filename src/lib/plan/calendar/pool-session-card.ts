import type { Discipline } from "@prisma/client";
import type { CalendarWorkoutProfile } from "@/lib/plan/calendar/serialize";
import type { UnscheduledChip, PoolDiscipline } from "@/lib/plan/calendar/unscheduled-chips";
import {
  buildWorkoutProfile,
  defaultPrimarySignalForDiscipline,
} from "@/lib/workout/workout-profile";
import {
  WORKOUT_TREE_VERSION,
  totalTreeDurationMinutes,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

export type PoolCardDraftMetrics = {
  distanceMeters?: number;
  targetPaceSeconds?: number;
  targetSpeedMps?: number;
};

export type PoolCardDraft = {
  nodes: WorkoutNode[];
  durationMinutes: number;
  profile: CalendarWorkoutProfile | null;
  distanceMeters?: number;
  targetPaceSeconds?: number;
  targetSpeedMps?: number;
};

export type PoolSessionCard = UnscheduledChip & {
  draft?: PoolCardDraft;
};

export type PoolDisciplineFilter = "ALL" | PoolDiscipline;

export type PoolCardDraftMap = Record<string, PoolCardDraft>;

export function emptyWorkoutTree(): WorkoutTreeDocument {
  return { version: WORKOUT_TREE_VERSION, nodes: [] };
}

export function draftFromNodes(
  nodes: WorkoutNode[],
  discipline: Discipline,
  metrics?: PoolCardDraftMetrics
): PoolCardDraft | null {
  if (nodes.length === 0) return null;
  const durationMinutes = totalTreeDurationMinutes(nodes);
  const built = buildWorkoutProfile(nodes, {
    primarySignal: defaultPrimarySignalForDiscipline(discipline),
    lengthView: "duration",
    discipline,
  });
  const profile: CalendarWorkoutProfile | null =
    built.segments.length === 0
      ? null
      : {
          totalX: built.totalX,
          yMin: built.yMin,
          yMax: built.yMax,
          segments: built.segments.map((s) => ({
            x: s.x,
            width: s.width,
            yLow: s.yLow,
            yHigh: s.yHigh,
            fill: s.fill,
          })),
        };
  return {
    nodes: structuredClone(nodes),
    durationMinutes,
    profile,
    ...(metrics?.distanceMeters != null && metrics.distanceMeters > 0
      ? { distanceMeters: metrics.distanceMeters }
      : {}),
    ...(metrics?.targetPaceSeconds != null && metrics.targetPaceSeconds > 0
      ? { targetPaceSeconds: metrics.targetPaceSeconds }
      : {}),
    ...(metrics?.targetSpeedMps != null && metrics.targetSpeedMps > 0
      ? { targetSpeedMps: metrics.targetSpeedMps }
      : {}),
  };
}

export function treeFromDraft(draft: PoolCardDraft | undefined): WorkoutTreeDocument {
  if (!draft || draft.nodes.length === 0) return emptyWorkoutTree();
  return {
    version: WORKOUT_TREE_VERSION,
    nodes: structuredClone(draft.nodes),
  };
}

export function mergeChipsWithDrafts(
  chips: UnscheduledChip[],
  drafts: PoolCardDraftMap
): PoolSessionCard[] {
  return chips.map((chip) => {
    const draft = drafts[chip.id];
    return draft ? { ...chip, draft } : { ...chip };
  });
}

export function filterPoolCards(
  cards: PoolSessionCard[],
  filter: PoolDisciplineFilter
): PoolSessionCard[] {
  if (filter === "ALL") return cards;
  return cards.filter((c) => c.discipline === filter);
}

export function pruneDraftsToChips(
  drafts: PoolCardDraftMap,
  chips: UnscheduledChip[]
): PoolCardDraftMap {
  return pruneDraftsToPoolTargets(drafts, chips.map((c) => c.id));
}

export function pruneDraftsToPoolTargets(
  drafts: PoolCardDraftMap,
  validCardIds: Iterable<string>
): PoolCardDraftMap {
  const ids = new Set(validCardIds);
  let changed = false;
  const next: PoolCardDraftMap = {};
  for (const [id, draft] of Object.entries(drafts)) {
    if (ids.has(id)) next[id] = draft;
    else changed = true;
  }
  return changed ? next : drafts;
}

export function isEndurancePoolDiscipline(
  discipline: PoolDiscipline
): discipline is Extract<PoolDiscipline, "SWIM" | "BIKE" | "RUN"> {
  return discipline === "SWIM" || discipline === "BIKE" || discipline === "RUN";
}
