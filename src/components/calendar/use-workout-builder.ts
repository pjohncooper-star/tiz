"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Discipline } from "@prisma/client";
import {
  findFolderInTree,
  type FolderTreeNode,
} from "@/lib/workout/workout-folder-library";
import { templateNodes } from "@/lib/workout/apply-workout-template";
import {
  ASSEMBLED_WORKOUT_DRAG_ID,
  isAssembledWorkoutDrag,
  parseWorkoutSessionDropId,
} from "@/lib/plan/workout-builder-dnd";
import type { WorkoutNode } from "@/lib/workout/workout-tree";

export type SelectedLibraryWorkout = {
  templateId: string;
  folderId: string;
  folderName: string;
  workoutName: string;
  discipline: Discipline;
  label: string;
  nodes: WorkoutNode[];
};

export type ProgressionPickerState = {
  folder: FolderTreeNode;
  onSelect: (workout: { id: string; name: string }) => void;
} | null;

export function useWorkoutBuilder(options: { onApplied?: () => void }) {
  const [open, setOpen] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline>("RUN");
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [selected, setSelected] = useState<SelectedLibraryWorkout | null>(null);
  const [picker, setPicker] = useState<ProgressionPickerState>(null);

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
    if (open) void loadTree();
  }, [open, loadTree]);

  const mergedNodes = useMemo(() => selected?.nodes ?? [], [selected]);

  const selectWorkout = useCallback(
    async (folderId: string, templateId: string, workoutName: string) => {
      const folder = findFolderInTree(tree, folderId);
      if (!folder) return;
      const res = await fetch(
        `/api/plan/workout-folders/${folderId}/workouts/${templateId}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        workout: { id: string; name: string; discipline: Discipline; steps: unknown };
      };
      const nodes = templateNodes(data.workout);
      setSelected({
        templateId,
        folderId,
        folderName: folder.name,
        workoutName,
        discipline: data.workout.discipline,
        label: `${folder.name} · ${workoutName}`,
        nodes,
      });
    },
    [tree]
  );

  const openFolder = useCallback(
    (folder: FolderTreeNode) => {
      if (folder.workouts.length === 0) return;
      if (folder.workouts.length === 1) {
        const w = folder.workouts[0]!;
        void selectWorkout(folder.id, w.id, w.name);
        return;
      }
      setPicker({
        folder,
        onSelect: (workout) => {
          void selectWorkout(folder.id, workout.id, workout.name);
          setPicker(null);
        },
      });
    },
    [selectWorkout]
  );

  const applyToSession = useCallback(
    async (sessionId: string) => {
      if (!selected) return false;
      const res = await fetch(`/api/plan/sessions/${sessionId}/apply-workout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutTemplateId: selected.templateId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Could not apply workout");
        return false;
      }
      setSelected(null);
      options.onApplied?.();
      return true;
    },
    [selected, options]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent): Promise<boolean> => {
      if (!open) return false;
      const { active, over } = event;
      if (!over) return false;

      if (isAssembledWorkoutDrag(active.id)) {
        const sessionId =
          parseWorkoutSessionDropId(over.id) ??
          (over.data.current?.type === "session-workout" ||
          over.data.current?.type === "session-link"
            ? (over.data.current.sessionId as string)
            : null) ??
          (String(over.id).startsWith("link:")
            ? String(over.id).slice("link:".length)
            : null);
        if (!sessionId || !selected) return false;
        const sessionDiscipline = over.data.current?.discipline as Discipline | undefined;
        if (sessionDiscipline && sessionDiscipline !== selected.discipline) {
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
    [open, selected, applyToSession]
  );

  return {
    open,
    setOpen,
    discipline,
    setDiscipline,
    tree,
    loadingTree,
    selected,
    setSelected,
    picker,
    setPicker,
    openFolder,
    selectWorkout,
    loadTree,
    mergedNodes,
    handleDragEnd,
    assembledDragId: ASSEMBLED_WORKOUT_DRAG_ID,
  };
}
