"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { ComponentType, Discipline } from "@prisma/client";
import {
  mergePaletteIntoTree,
  progressionLabel,
  resolveComponentSteps,
  type PaletteApplyItem,
} from "@/lib/workout/component-library";
import {
  ASSEMBLED_WORKOUT_DRAG_ID,
  isAssembledWorkoutDrag,
  parseComponentLibraryDragId,
  parsePaletteItemDragId,
  parseWorkoutSessionDropId,
} from "@/lib/plan/workout-builder-dnd";
import type { WorkoutNode } from "@/lib/workout/workout-tree";

export type WorkoutComponentSummary = {
  id: string;
  name: string;
  discipline: Discipline;
  componentType: ComponentType;
  steps: unknown;
  progressionSteps: { id: string; label: string; orderIndex: number; steps: unknown }[];
};

export type ClientPaletteItem = {
  clientId: string;
  componentId: string;
  componentName: string;
  componentType: ComponentType;
  progressionStepId: string | null;
  progressionLabel: string;
};

export type ProgressionPickerState = {
  component: WorkoutComponentSummary;
  onSelect: (progressionStepId: string | null, label: string) => void;
} | null;

function newClientId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useWorkoutBuilder(options: {
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline>("RUN");
  const [components, setComponents] = useState<WorkoutComponentSummary[]>([]);
  const [palette, setPalette] = useState<ClientPaletteItem[]>([]);
  const [picker, setPicker] = useState<ProgressionPickerState>(null);
  const [loadingComponents, setLoadingComponents] = useState(false);

  const loadComponents = useCallback(async () => {
    setLoadingComponents(true);
    try {
      const res = await fetch(`/api/plan/components?discipline=${discipline}`);
      if (!res.ok) return;
      const data = (await res.json()) as { components: WorkoutComponentSummary[] };
      setComponents(data.components);
    } finally {
      setLoadingComponents(false);
    }
  }, [discipline]);

  useEffect(() => {
    if (open) void loadComponents();
  }, [open, loadComponents]);

  const mergedNodes = useMemo(() => {
    const groups: WorkoutNode[][] = [];
    for (const item of palette) {
      const component = components.find((c) => c.id === item.componentId);
      if (!component) continue;
      groups.push(resolveComponentSteps(component, item.progressionStepId));
    }
    return mergePaletteIntoTree(groups).nodes;
  }, [palette, components]);

  const addToPalette = useCallback(
    (component: WorkoutComponentSummary, progressionStepId: string | null) => {
      const label = progressionLabel(
        component.name,
        progressionStepId,
        component.progressionSteps
      );
      setPalette((prev) => [
        ...prev,
        {
          clientId: newClientId(),
          componentId: component.id,
          componentName: component.name,
          componentType: component.componentType,
          progressionStepId,
          progressionLabel: label,
        },
      ]);
    },
    []
  );

  const openPicker = useCallback(
    (component: WorkoutComponentSummary) => {
      setPicker({
        component,
        onSelect: (progressionStepId, label) => {
          addToPalette(component, progressionStepId);
          setPicker(null);
        },
      });
    },
    [addToPalette]
  );

  const paletteApplyPayload = useCallback((): PaletteApplyItem[] => {
    return palette.map((item, index) => ({
      componentId: item.componentId,
      progressionStepId: item.progressionStepId,
      orderIndex: index,
    }));
  }, [palette]);

  const applyToSession = useCallback(
    async (sessionId: string) => {
      if (palette.length === 0) return false;
      const res = await fetch(`/api/plan/sessions/${sessionId}/apply-workout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ palette: paletteApplyPayload() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Could not apply workout");
        return false;
      }
      setPalette([]);
      options.onApplied?.();
      return true;
    },
    [palette, paletteApplyPayload, options]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent): Promise<boolean> => {
      if (!open) return false;
      const { active, over } = event;
      if (!over) return false;

      const activeType = active.data.current?.type as string | undefined;

      if (isAssembledWorkoutDrag(active.id)) {
        const sessionId =
          parseWorkoutSessionDropId(over.id) ??
          (over.data.current?.type === "session-workout"
            ? (over.data.current.sessionId as string)
            : null);
        if (!sessionId) return false;
        const sessionDiscipline = over.data.current?.discipline as Discipline | undefined;
        if (sessionDiscipline && sessionDiscipline !== discipline) {
          alert("Workout discipline does not match session");
          return true;
        }
        if (over.data.current?.source === "RACE") {
          alert("Cannot apply workout to a race session");
          return true;
        }
        if (
          over.data.current?.hasStructuredWorkout &&
          !confirm("Replace existing structured workout on this session?")
        ) {
          return true;
        }
        await applyToSession(sessionId);
        return true;
      }

      if (activeType === "workout-component") {
        const componentId = parseComponentLibraryDragId(active.id);
        if (!componentId) return false;
        const overType = over.data.current?.type as string | undefined;
        if (overType !== "palette-drop" && overType !== "palette-item") return false;
        const component = components.find((c) => c.id === componentId);
        if (component) openPicker(component);
        return true;
      }

      if (activeType === "palette-item") {
        const clientId = parsePaletteItemDragId(active.id);
        if (!clientId) return false;
        const overClientId = parsePaletteItemDragId(over.id);
        if (!overClientId || clientId === overClientId) return false;
        setPalette((prev) => {
          const from = prev.findIndex((p) => p.clientId === clientId);
          const to = prev.findIndex((p) => p.clientId === overClientId);
          if (from < 0 || to < 0) return prev;
          const next = [...prev];
          const [moved] = next.splice(from, 1);
          if (!moved) return prev;
          next.splice(to, 0, moved);
          return next;
        });
        return true;
      }

      return false;
    },
    [open, components, discipline, openPicker, applyToSession]
  );

  return {
    open,
    setOpen,
    discipline,
    setDiscipline,
    components,
    loadingComponents,
    palette,
    setPalette,
    mergedNodes,
    picker,
    setPicker,
    openPicker,
    loadComponents,
    handleDragEnd,
    assembledDragId: ASSEMBLED_WORKOUT_DRAG_ID,
  };
}
