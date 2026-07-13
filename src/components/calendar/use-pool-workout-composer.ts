"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Discipline } from "@prisma/client";
import { WORKOUT_TREE_VERSION, type WorkoutNode } from "@/lib/workout/workout-tree";
import {
  defaultLeafStep,
  defaultRepeatBlock,
  totalTreeDurationMinutes,
} from "@/lib/workout/workout-tree";
import { templateNodes } from "@/lib/workout/apply-workout-template";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import {
  ASSEMBLED_WORKOUT_DRAG_ID,
  isAssembledWorkoutDrag,
  parseWorkoutSessionDropId,
} from "@/lib/plan/workout-builder-dnd";
import {
  mergeSegmentNodes,
  type GraphSegment,
} from "@/lib/plan/calendar/workout-graph-compose";
import { parseWorkoutTree } from "@/lib/workout/steps";

export type EnduranceDiscipline = Extract<Discipline, "SWIM" | "BIKE" | "RUN">;

export type IntervalDraft = {
  reps: number;
  workSeconds: number;
  workZone: number;
  restSeconds: number;
  restZone: number;
};

const DEFAULT_INTERVAL: IntervalDraft = {
  reps: 5,
  workSeconds: 180,
  workZone: 4,
  restSeconds: 60,
  restZone: 1,
};

function newSegmentId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePoolWorkoutComposer(options: {
  onApplied?: () => void;
  active: boolean;
}) {
  const [discipline, setDiscipline] = useState<EnduranceDiscipline>("RUN");
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [segments, setSegments] = useState<GraphSegment[]>([]);
  const [historySource, setHistorySource] = useState<string | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState<IntervalDraft>(DEFAULT_INTERVAL);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    try {
      const res = await fetch(`/api/plan/workout-folders?tree=1&discipline=${discipline}`);
      if (!res.ok) return;
      const data = (await res.json()) as { tree: FolderTreeNode[] };
      setTree(data.tree);
    } finally {
      setLoadingTree(false);
    }
  }, [discipline]);

  useEffect(() => {
    if (options.active) void loadTree();
  }, [options.active, loadTree]);

  const mergedNodes = useMemo(() => mergeSegmentNodes(segments), [segments]);
  const durationMinutes = useMemo(
    () => totalTreeDurationMinutes(mergedNodes),
    [mergedNodes]
  );

  const clear = useCallback(() => {
    setSegments([]);
    setHistorySource(null);
  }, []);

  const appendNodes = useCallback((label: string, nodes: WorkoutNode[]) => {
    if (nodes.length === 0) return;
    setSegments((prev) => [
      ...prev,
      { id: newSegmentId(), label, nodes: structuredClone(nodes) },
    ]);
  }, []);

  const appendTemplate = useCallback(
    async (folderId: string, templateId: string, name: string) => {
      const res = await fetch(
        `/api/plan/workout-folders/${folderId}/workouts/${templateId}`
      );
      if (!res.ok) {
        alert("Could not load workout");
        return;
      }
      const data = (await res.json()) as {
        workout: { name: string; steps: unknown; discipline: Discipline };
      };
      if (data.workout.discipline !== discipline) {
        alert("Workout discipline does not match Build filter");
        return;
      }
      appendNodes(name || data.workout.name, templateNodes(data.workout));
      setHistorySource(null);
    },
    [appendNodes, discipline]
  );

  const removeSegment = useCallback((segmentId: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== segmentId));
  }, []);

  const moveSegment = useCallback((segmentId: string, direction: -1 | 1) => {
    setSegments((prev) => {
      const index = prev.findIndex((s) => s.id === segmentId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item!);
      return next;
    });
  }, []);

  const addCustomInterval = useCallback(() => {
    const { reps, workSeconds, workZone, restSeconds, restZone } = intervalDraft;
    const workSignal = discipline === "BIKE" ? "power" : "pace";
    const block =
      reps > 1
        ? {
            ...defaultRepeatBlock(),
            repeatCount: Math.max(1, reps),
            children: [
              {
                ...defaultLeafStep(),
                intensity: "interval" as const,
                duration: { type: "time" as const, value: Math.max(1, workSeconds) },
                target: {
                  signal: workSignal as "power" | "pace",
                  mode: "zone" as const,
                  zone: workZone,
                },
              },
              {
                ...defaultLeafStep(),
                intensity: "recovery" as const,
                duration: { type: "time" as const, value: Math.max(0, restSeconds) },
                target: {
                  signal: workSignal as "power" | "pace",
                  mode: "zone" as const,
                  zone: restZone,
                },
              },
            ],
          }
        : {
            ...defaultLeafStep(),
            intensity: "interval" as const,
            duration: { type: "time" as const, value: Math.max(1, workSeconds) },
            target: {
              signal: workSignal as "power" | "pace",
              mode: "zone" as const,
              zone: workZone,
            },
          };

    appendNodes(
      reps > 1 ? `${reps}×${Math.round(workSeconds / 60)}' Z${workZone}` : `Interval Z${workZone}`,
      [block]
    );
    setIntervalOpen(false);
    setHistorySource(null);
  }, [appendNodes, discipline, intervalDraft]);

  const loadFromSession = useCallback(
    async (sessionId: string, sourceLabel: string) => {
      const res = await fetch(`/api/plan/sessions/${sessionId}`);
      if (!res.ok) {
        alert("Could not load session workout");
        return false;
      }
      const data = (await res.json()) as {
        session?: {
          discipline: Discipline;
          structuredWorkout?: { steps?: unknown } | null;
        };
      };
      const session = data.session;
      if (!session?.structuredWorkout?.steps) {
        alert("Session has no structured workout");
        return false;
      }
      if (session.discipline === "STRENGTH") {
        alert("Strength sessions are not supported in the Build graph");
        return false;
      }
      const nodes = parseWorkoutTree(session.structuredWorkout.steps).nodes;
      if (nodes.length === 0) {
        alert("Session workout is empty");
        return false;
      }
      setDiscipline(session.discipline as EnduranceDiscipline);
      setSegments([{ id: newSegmentId(), label: sourceLabel, nodes }]);
      setHistorySource(sourceLabel);
      return true;
    },
    []
  );

  const applyToSession = useCallback(
    async (sessionId: string) => {
      if (mergedNodes.length === 0) return false;
      const res = await fetch(`/api/plan/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: { version: WORKOUT_TREE_VERSION, nodes: mergedNodes },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(typeof data.error === "string" ? data.error : "Could not apply workout");
        return false;
      }
      options.onApplied?.();
      return true;
    },
    [mergedNodes, options]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent): Promise<boolean> => {
      if (!options.active) return false;
      const { active, over } = event;
      if (!over) return false;

      if (active.data.current?.type === "pool-segment-template") {
        const template = active.data.current.template as {
          folderId: string;
          templateId: string;
          name: string;
        };
        if (over.data.current?.type === "pool-workout-graph" || over.id === "pool-workout-graph") {
          await appendTemplate(template.folderId, template.templateId, template.name);
          return true;
        }
        return false;
      }

      if (isAssembledWorkoutDrag(active.id)) {
        const sessionId =
          parseWorkoutSessionDropId(over.id) ??
          (over.data.current?.type === "session-workout"
            ? (over.data.current.sessionId as string)
            : null);
        if (!sessionId || mergedNodes.length === 0) return false;
        const sessionDiscipline = over.data.current?.discipline as Discipline | undefined;
        if (sessionDiscipline && sessionDiscipline !== discipline) {
          alert("Workout discipline does not match session");
          return true;
        }
        if (over.data.current?.source === "RACE") {
          alert("Cannot apply workout to a race session");
          return true;
        }
        if (over.data.current?.hasStructuredWorkout) {
          alert("Remove the existing workout before applying a new one.");
          return true;
        }
        await applyToSession(sessionId);
        return true;
      }

      return false;
    },
    [options.active, mergedNodes, discipline, applyToSession, appendTemplate]
  );

  return {
    discipline,
    setDiscipline,
    tree,
    loadingTree,
    loadTree,
    segments,
    mergedNodes,
    durationMinutes,
    historySource,
    clear,
    appendTemplate,
    removeSegment,
    moveSegment,
    intervalOpen,
    setIntervalOpen,
    intervalDraft,
    setIntervalDraft,
    addCustomInterval,
    loadFromSession,
    applyToSession,
    handleDragEnd,
    assembledDragId: ASSEMBLED_WORKOUT_DRAG_ID,
    hasWorkout: mergedNodes.length > 0,
  };
}

export type PoolWorkoutComposer = ReturnType<typeof usePoolWorkoutComposer>;
