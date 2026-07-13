"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Discipline } from "@prisma/client";
import {
  WORKOUT_TREE_VERSION,
  totalTreeDurationMinutes,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { templateNodes } from "@/lib/workout/apply-workout-template";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import {
  ASSEMBLED_WORKOUT_DRAG_ID,
  isAssembledWorkoutDrag,
  parseWorkoutSessionDropId,
} from "@/lib/plan/workout-builder-dnd";
import { parseWorkoutTree } from "@/lib/workout/steps";

export type EnduranceDiscipline = Extract<Discipline, "SWIM" | "BIKE" | "RUN">;

const EMPTY_TREE: WorkoutTreeDocument = {
  version: WORKOUT_TREE_VERSION,
  nodes: [],
};

export function usePoolWorkoutComposer(options: {
  onApplied?: () => void;
  active: boolean;
}) {
  const [discipline, setDiscipline] = useState<EnduranceDiscipline>("RUN");
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [workoutTree, setWorkoutTree] = useState<WorkoutTreeDocument>(EMPTY_TREE);
  const [historySource, setHistorySource] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    try {
      const res = await fetch(`/api/plan/workout-folders?tree=1&discipline=${discipline}`);
      if (!res.ok) return;
      const data = (await res.json()) as { tree: FolderTreeNode[] };
      setFolderTree(data.tree);
    } finally {
      setLoadingTree(false);
    }
  }, [discipline]);

  useEffect(() => {
    if (options.active) void loadTree();
  }, [options.active, loadTree]);

  const mergedNodes = workoutTree.nodes;
  const durationMinutes = useMemo(
    () => totalTreeDurationMinutes(mergedNodes),
    [mergedNodes]
  );

  const clear = useCallback(() => {
    setWorkoutTree(EMPTY_TREE);
    setHistorySource(null);
  }, []);

  const appendNodes = useCallback((nodes: WorkoutNode[]) => {
    if (nodes.length === 0) return;
    setWorkoutTree((prev) => ({
      version: WORKOUT_TREE_VERSION,
      nodes: [...prev.nodes, ...structuredClone(nodes)],
    }));
    setHistorySource(null);
  }, []);

  const appendTemplate = useCallback(
    async (folderId: string, templateId: string, _name: string) => {
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
      appendNodes(templateNodes(data.workout));
    },
    [appendNodes, discipline]
  );

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
      setWorkoutTree({ version: WORKOUT_TREE_VERSION, nodes });
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
        if (mergedNodes.length === 0) {
          alert("Assemble a workout in the graph before dragging to a session.");
          return true;
        }

        const overId = String(over.id);
        const sessionId =
          parseWorkoutSessionDropId(over.id) ??
          (over.data.current?.type === "session-workout" ||
          over.data.current?.type === "session-link"
            ? (over.data.current.sessionId as string)
            : null) ??
          (overId.startsWith("link:") ? overId.slice("link:".length) : null);

        if (!sessionId) {
          if (over.data.current?.type === "day") {
            alert(
              "Drop onto an empty session card (same discipline), not the empty day area."
            );
          }
          return true;
        }

        const overSession = over.data.current?.session as
          | { discipline?: Discipline; source?: string; stepCount?: number }
          | undefined;
        const sessionDiscipline =
          (over.data.current?.discipline as Discipline | undefined) ??
          overSession?.discipline;
        if (sessionDiscipline && sessionDiscipline !== discipline) {
          alert(
            `Workout is ${discipline}; that session is ${sessionDiscipline}. Switch the Build discipline filter to match.`
          );
          return true;
        }
        const source =
          (over.data.current?.source as string | undefined) ?? overSession?.source;
        if (source === "RACE") {
          alert("Cannot apply workout to a race session");
          return true;
        }
        const hasStructured =
          over.data.current?.hasStructuredWorkout === true ||
          (overSession?.stepCount != null && overSession.stepCount > 0);
        if (hasStructured) {
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
    /** Folder library tree for segment columns. */
    tree: folderTree,
    loadingTree,
    loadTree,
    workoutTree,
    setWorkoutTree,
    mergedNodes,
    durationMinutes,
    historySource,
    clear,
    appendTemplate,
    loadFromSession,
    applyToSession,
    handleDragEnd,
    assembledDragId: ASSEMBLED_WORKOUT_DRAG_ID,
    hasWorkout: mergedNodes.length > 0,
  };
}

export type PoolWorkoutComposer = ReturnType<typeof usePoolWorkoutComposer>;
