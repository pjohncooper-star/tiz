"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentType, Discipline } from "@prisma/client";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { COMPONENT_TYPE_LABELS, COMPONENT_TYPES } from "@/lib/workout/component-types";
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

type ProgressionStep = {
  id?: string;
  label: string;
  orderIndex: number;
  steps: unknown;
};

export type WorkoutComponentEditorProps = {
  mode: "create" | "edit";
  componentId?: string;
  initial?: {
    name: string;
    discipline: Discipline;
    componentType: ComponentType;
    notes: string;
    steps: unknown;
    progressionSteps: ProgressionStep[];
    lastCompletedSession?: { id: string; title: string; scheduledDate: string } | null;
    lastCompletedAt?: string | null;
  };
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
};

function defaultTree(): WorkoutTreeDocument {
  return { version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] };
}

export function WorkoutComponentEditor({
  mode,
  componentId,
  initial,
  disciplineSettings,
}: WorkoutComponentEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [discipline, setDiscipline] = useState<Discipline>(initial?.discipline ?? "RUN");
  const [componentType, setComponentType] = useState<ComponentType>(
    initial?.componentType ?? "MAIN_SET"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tree, setTree] = useState<WorkoutTreeDocument>(() =>
    initial?.steps ? parseWorkoutTree(initial.steps) : defaultTree()
  );
  const [progressionSteps, setProgressionSteps] = useState<{
    id?: string;
    label: string;
    orderIndex: number;
    steps: WorkoutTreeDocument;
  }[]>(
    () =>
      initial?.progressionSteps.map((s) => ({
        ...s,
        steps: parseWorkoutTree(s.steps),
      })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitSettings = unitSettingsForDiscipline(discipline as PlanDiscipline, disciplineSettings);
  const poolSize = poolSizeForSwimStep(unitSettings.poolSize);

  async function saveComponent() {
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
      componentType,
      notes: notes.trim() || null,
      steps: serializeWorkoutTree(tree),
    };

    const res =
      mode === "create"
        ? await fetch("/api/plan/components", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/plan/components/${componentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const message = readApiError(data, "Could not save component");
      setError(
        res.status === 404
          ? "Workout components are not available in this environment. If you self-host, enable session planning features and run the workout components migration."
          : message
      );
      setSaving(false);
      return;
    }

    const data = (await res.json()) as { component: { id: string } };
    const id = mode === "create" ? data.component.id : componentId!;

    for (const step of progressionSteps) {
      const stepBody = {
        label: step.label.trim() || `Variant ${step.orderIndex + 1}`,
        steps: serializeWorkoutTree(step.steps),
        orderIndex: step.orderIndex,
      };
      const stepRes = step.id
        ? await fetch(`/api/plan/components/${id}/progression/${step.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stepBody),
          })
        : await fetch(`/api/plan/components/${id}/progression`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stepBody),
          });
      if (!stepRes.ok) {
        const stepData = await stepRes.json().catch(() => null);
        setError(
          readApiError(stepData, "Component saved, but a progression variant could not be saved.")
        );
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.push("/plan/components");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {initial?.lastCompletedSession ? (
        <Card title="Last completed">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link
              href={`/plan/sessions/${initial.lastCompletedSession.id}?returnTo=${encodeURIComponent("/plan/components")}`}
              className="text-sky-600 hover:underline dark:text-sky-400"
            >
              {initial.lastCompletedSession.title}
            </Link>
            {initial.lastCompletedAt
              ? ` · ${new Date(initial.lastCompletedAt).toLocaleDateString()}`
              : null}
          </p>
        </Card>
      ) : null}

      <Card title="Details">
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
          <div>
            <Label>Type</Label>
            <Select
              value={componentType}
              onChange={(e) => setComponentType(e.target.value as ComponentType)}
            >
              {COMPONENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COMPONENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card title="Base steps">
        <WorkoutTreeEditor
          discipline={discipline}
          displayUnit={unitSettings.displayUnit}
          poolSize={poolSize}
          tree={tree}
          onChange={setTree}
        />
      </Card>

      <Card title="Progression variants">
        <div className="space-y-4">
          {progressionSteps.map((step, index) => (
            <div key={step.id ?? `new-${index}`} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={step.label}
                  onChange={(e) =>
                    setProgressionSteps((prev) =>
                      prev.map((s, i) => (i === index ? { ...s, label: e.target.value } : s))
                    )
                  }
                  placeholder="Label e.g. 12×400"
                />
                {step.id ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void fetch(`/api/plan/components/${componentId}/progression/${step.id}`, {
                        method: "DELETE",
                      }).then(() =>
                        setProgressionSteps((prev) => prev.filter((_, i) => i !== index))
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setProgressionSteps((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <WorkoutTreeEditor
                discipline={discipline}
                displayUnit={unitSettings.displayUnit}
                poolSize={poolSize}
                tree={step.steps}
                onChange={(next) =>
                  setProgressionSteps((prev) =>
                    prev.map((s, i) => (i === index ? { ...s, steps: next } : s))
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setProgressionSteps((prev) => [
                ...prev,
                { label: `Variant ${prev.length + 1}`, orderIndex: prev.length, steps: defaultTree() },
              ])
            }
          >
            Add progression step
          </Button>
        </div>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void saveComponent()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link href="/plan/components">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </div>
  );
}
