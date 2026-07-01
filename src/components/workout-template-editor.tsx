"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Discipline } from "@prisma/client";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import {
  defaultLeafStep,
  serializeWorkoutTree,
  WORKOUT_TREE_VERSION,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { parseWorkoutTree } from "@/lib/workout/steps";
import { unitSettingsForDiscipline, poolSizeForSwimStep } from "@/lib/units/discipline-settings";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { readApiError } from "@/lib/api/client-error";
import { libraryHref } from "@/lib/plan/library-href";

export type WorkoutTemplateEditorProps = {
  folderId: string;
  templateId?: string;
  mode: "create" | "edit";
  defaultDiscipline?: Discipline;
  initial?: {
    name: string;
    discipline: Discipline;
    steps: unknown;
  };
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
};

function defaultTree(): WorkoutTreeDocument {
  return { version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] };
}

export function WorkoutTemplateEditor({
  folderId,
  templateId,
  mode,
  defaultDiscipline,
  initial,
  disciplineSettings,
}: WorkoutTemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(
    initial?.discipline ?? defaultDiscipline ?? "RUN"
  );
  const [tree, setTree] = useState<WorkoutTreeDocument>(() =>
    initial?.steps ? parseWorkoutTree(initial.steps) : defaultTree()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitSettings = unitSettingsForDiscipline(discipline as PlanDiscipline, disciplineSettings);
  const poolSize = poolSizeForSwimStep(unitSettings.poolSize);

  async function saveWorkout() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    const body = {
      name: trimmedName,
      discipline,
      steps: serializeWorkoutTree(tree),
    };

    const res =
      mode === "create"
        ? await fetch(`/api/plan/workout-folders/${folderId}/workouts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/plan/workout-folders/${folderId}/workouts/${templateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(readApiError(data, "Could not save workout"));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(libraryHref({ folderId }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card title="Workout details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Discipline</Label>
            <Select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as Discipline)}
            >
              <option value="RUN">Run</option>
              <option value="BIKE">Bike</option>
              <option value="SWIM">Swim</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card title="Steps">
        <WorkoutTreeEditor
          discipline={discipline}
          displayUnit={unitSettings.displayUnit}
          poolSize={poolSize}
          tree={tree}
          onChange={setTree}
        />
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void saveWorkout()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(libraryHref({ folderId }))}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
