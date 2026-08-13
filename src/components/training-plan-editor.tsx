"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Discipline, SessionRole } from "@prisma/client";
import {
  ApplyTrainingPlanDialog,
  type ApplyTrainingPlanListItem,
} from "@/components/apply-training-plan-dialog";
import { NumberEditorInput } from "@/components/number-editor-input";
import { TrainingPlanWeekGrid } from "@/components/training-plan-week-grid";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
import { Button, Input, Label, Select } from "@/components/ui";
import { readApiError } from "@/lib/api/client-error";
import type { PlanDiscipline } from "@/lib/plan/session";
import { SESSION_ROLE_LABELS, SESSION_ROLES } from "@/lib/plan/session-role";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import {
  poolSizeForSwimStep,
  unitSettingsForDiscipline,
} from "@/lib/units/discipline-settings";
import type { RacePaceAnchors } from "@/lib/workout/relative-pace";
import {
  defaultLeafStep,
  serializeWorkoutTree,
  WORKOUT_TREE_VERSION,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

export type TrainingPlanEditorSession = {
  id: string;
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  title: string;
  notes: string | null;
  sessionRole: string;
  estimatedDurationMinutes: number | null;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: string | null;
  hasStructuredWorkout: boolean;
  relativePaceLabels: string[];
  steps: WorkoutTreeDocument | null;
};

export type TrainingPlanEditorPlan = {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  sessionCount: number;
  anchorWeekday: string;
  sessions: TrainingPlanEditorSession[];
  appliedFutureSessionCount: number;
  requiredPaceAnchors: { ref: string; refSource: string; label: string }[];
};

type TrainingPlanEditorProps = {
  initialPlan: TrainingPlanEditorPlan;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  racePaces: RacePaceAnchors | null;
  thresholdByDiscipline: Partial<
    Record<"RUN" | "SWIM" | "BIKE", { paceSeconds: number | null; ftpWatts: number | null }>
  >;
};

function emptyTree(): WorkoutTreeDocument {
  return { version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] };
}

function cloneSession(s: TrainingPlanEditorSession): TrainingPlanEditorSession {
  return {
    ...s,
    steps: s.steps ? (JSON.parse(JSON.stringify(s.steps)) as WorkoutTreeDocument) : null,
  };
}

export function TrainingPlanEditor({
  initialPlan,
  disciplineSettings,
  racePaces,
  thresholdByDiscipline,
}: TrainingPlanEditorProps) {
  const router = useRouter();
  const [planMeta, setPlanMeta] = useState({
    name: initialPlan.name,
    description: initialPlan.description ?? "",
    durationDays: initialPlan.durationDays,
    sessionCount: initialPlan.sessionCount,
    appliedFutureSessionCount: initialPlan.appliedFutureSessionCount,
  });
  const [sessions, setSessions] = useState(() =>
    initialPlan.sessions.map(cloneSession)
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialPlan.sessions[0]?.id ?? null
  );
  const [draft, setDraft] = useState<TrainingPlanEditorSession | null>(() =>
    initialPlan.sessions[0] ? cloneSession(initialPlan.sessions[0]) : null
  );
  const [dirty, setDirty] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [structuredEnabled, setStructuredEnabled] = useState(
    () => Boolean(initialPlan.sessions[0]?.hasStructuredWorkout)
  );

  const selected = draft;

  function selectSession(id: string) {
    if (dirty && !window.confirm("Discard unsaved session changes?")) return;
    const next = sessions.find((s) => s.id === id);
    if (!next) return;
    setSelectedId(id);
    setDraft(cloneSession(next));
    setStructuredEnabled(Boolean(next.hasStructuredWorkout));
    setDirty(false);
    setError(null);
  }

  function updateDraft(patch: Partial<TrainingPlanEditorSession>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  async function savePlanMeta() {
    const name = planMeta.name.trim();
    if (!name) {
      setError("Plan name is required");
      return;
    }
    setSavingMeta(true);
    setError(null);
    const res = await fetch(`/api/plan/training-plans/${initialPlan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: planMeta.description.trim() || null,
      }),
    });
    setSavingMeta(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(readApiError(data, "Could not save plan"));
      return;
    }
    const data = await res.json();
    setPlanMeta((m) => ({
      ...m,
      name: data.plan.name as string,
      description: (data.plan.description as string | null) ?? "",
    }));
    router.refresh();
  }

  async function saveSession() {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Session title is required");
      return;
    }
    setSavingSession(true);
    setError(null);
    const stepsPayload =
      structuredEnabled && draft.steps && draft.steps.nodes.length > 0
        ? serializeWorkoutTree(draft.steps)
        : null;
    const res = await fetch(
      `/api/plan/training-plans/${initialPlan.id}/sessions/${draft.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOffset: draft.dayOffset,
          sortOrder: draft.sortOrder,
          discipline: draft.discipline,
          title,
          notes: draft.notes?.trim() || null,
          sessionRole: draft.sessionRole,
          estimatedDurationMinutes: draft.estimatedDurationMinutes,
          steps: stepsPayload,
        }),
      }
    );
    setSavingSession(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(readApiError(data, "Could not save session"));
      return;
    }
    const data = await res.json();
    const updated = data.session as TrainingPlanEditorSession;
    setSessions((prev) =>
      prev
        .map((s) => (s.id === updated.id ? cloneSession(updated) : s))
        .sort((a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder)
    );
    setDraft(cloneSession(updated));
    setStructuredEnabled(Boolean(updated.hasStructuredWorkout));
    setDirty(false);
    setPlanMeta((m) => ({
      ...m,
      sessionCount: sessions.length,
      durationDays: Math.max(
        ...sessions.map((s) => (s.id === updated.id ? updated.dayOffset : s.dayOffset)),
        0
      ) + 1,
    }));
    router.refresh();
  }

  async function addSession(dayOffset?: number) {
    if (dirty && !window.confirm("Discard unsaved session changes?")) return;
    const maxOffset = sessions.reduce((m, s) => Math.max(m, s.dayOffset), -1);
    const nextOffset = dayOffset ?? maxOffset + 1;
    setError(null);
    const res = await fetch(`/api/plan/training-plans/${initialPlan.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayOffset: nextOffset,
        discipline: "RUN",
        title: "New session",
        sessionRole: "MODERATE",
        estimatedDurationMinutes: 45,
        steps: null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(readApiError(data, "Could not add session"));
      return;
    }
    const data = await res.json();
    const created = data.session as TrainingPlanEditorSession;
    const nextSessions = [...sessions, cloneSession(created)].sort(
      (a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder
    );
    setSessions(nextSessions);
    setSelectedId(created.id);
    setDraft(cloneSession(created));
    setStructuredEnabled(false);
    setDirty(false);
    setPlanMeta((m) => ({
      ...m,
      sessionCount: nextSessions.length,
      durationDays: Math.max(...nextSessions.map((s) => s.dayOffset), 0) + 1,
    }));
    router.refresh();
  }

  async function deleteSession() {
    if (!draft) return;
    if (sessions.length <= 1) {
      setError("A training plan must keep at least one session");
      return;
    }
    if (!window.confirm(`Delete “${draft.title}” from this library plan?`)) return;
    setError(null);
    const res = await fetch(
      `/api/plan/training-plans/${initialPlan.id}/sessions/${draft.id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(readApiError(data, "Could not delete session"));
      return;
    }
    const data = await res.json();
    const next = sessions.filter((s) => s.id !== draft.id);
    setSessions(next);
    const pick = next[0] ?? null;
    setSelectedId(pick?.id ?? null);
    setDraft(pick ? cloneSession(pick) : null);
    setStructuredEnabled(Boolean(pick?.hasStructuredWorkout));
    setDirty(false);
    setPlanMeta((m) => ({
      ...m,
      sessionCount: typeof data.sessionCount === "number" ? data.sessionCount : next.length,
      durationDays:
        typeof data.durationDays === "number"
          ? data.durationDays
          : Math.max(...next.map((s) => s.dayOffset), 0) + 1,
    }));
    router.refresh();
  }

  async function handleClearFuture() {
    if (
      !window.confirm(
        `Remove future calendar sessions applied from “${planMeta.name}” (today onward)?`
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/plan/training-plans/${initialPlan.id}?clearFuture=1`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Clear failed");
      return;
    }
    setPlanMeta((m) => ({ ...m, appliedFutureSessionCount: 0 }));
    window.alert(
      `Removed ${typeof data.removed === "number" ? data.removed : 0} future session(s).`
    );
  }

  const applyPlanItem: ApplyTrainingPlanListItem = {
    id: initialPlan.id,
    name: planMeta.name,
    description: planMeta.description || null,
    durationDays: planMeta.durationDays,
    sessionCount: planMeta.sessionCount,
    anchorWeekday: initialPlan.anchorWeekday,
  };

  const discipline = (selected?.discipline ?? "RUN") as Discipline;
  const unitSettings = unitSettingsForDiscipline(
    discipline as PlanDiscipline,
    disciplineSettings
  );
  const poolSize = poolSizeForSwimStep(unitSettings.poolSize);
  const paceCtx =
    discipline === "RUN" || discipline === "SWIM" || discipline === "BIKE"
      ? thresholdByDiscipline[discipline]
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Plan name</Label>
              <Input
                value={planMeta.name}
                onChange={(e) =>
                  setPlanMeta((m) => ({ ...m, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={planMeta.description}
                onChange={(e) =>
                  setPlanMeta((m) => ({ ...m, description: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            {planMeta.sessionCount} sessions · {planMeta.durationDays} days · starts{" "}
            {initialPlan.anchorWeekday}
            {planMeta.appliedFutureSessionCount > 0
              ? ` · ${planMeta.appliedFutureSessionCount} future on calendar`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={savingMeta}
            onClick={() => void savePlanMeta()}
          >
            {savingMeta ? "Saving…" : "Save plan details"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setApplyOpen(true)}>
            Apply…
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleClearFuture()}>
            Clear future
          </Button>
        </div>
      </div>

      {initialPlan.requiredPaceAnchors.length > 0 ? (
        <p className="text-xs text-zinc-500">
          Relative paces:{" "}
          {initialPlan.requiredPaceAnchors.map((a) => a.label).join(", ")}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sessions</h2>
          <Button type="button" variant="secondary" onClick={() => void addSession()}>
            Add after last day
          </Button>
        </div>
        <TrainingPlanWeekGrid
          anchorWeekday={initialPlan.anchorWeekday}
          durationDays={planMeta.durationDays}
          sessions={sessions}
          selectedId={selectedId}
          onSelectSession={selectSession}
          onAddSession={(dayOffset) => void addSession(dayOffset)}
        />
      </div>

      <div className="min-w-0 space-y-4">
          {!selected ? (
            <p className="text-sm text-zinc-500">Select a session to edit.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={selected.title}
                    onChange={(e) => updateDraft({ title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Discipline</Label>
                  <Select
                    value={selected.discipline}
                    onChange={(e) =>
                      updateDraft({ discipline: e.target.value as Discipline })
                    }
                  >
                    <option value="RUN">Run</option>
                    <option value="BIKE">Bike</option>
                    <option value="SWIM">Swim</option>
                    <option value="STRENGTH">Strength</option>
                  </Select>
                </div>
                <NumberEditorInput
                  label="Day offset (0 = first day)"
                  value={selected.dayOffset}
                  min={0}
                  max={200}
                  onCommit={(v) => {
                    if (v == null) return;
                    updateDraft({ dayOffset: v });
                  }}
                />
                <div>
                  <Label>Role</Label>
                  <Select
                    value={selected.sessionRole}
                    onChange={(e) =>
                      updateDraft({ sessionRole: e.target.value as SessionRole })
                    }
                  >
                    {SESSION_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {SESSION_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                </div>
                <NumberEditorInput
                  label="Duration (minutes)"
                  value={selected.estimatedDurationMinutes}
                  min={1}
                  nullable
                  onCommit={(v) => updateDraft({ estimatedDurationMinutes: v })}
                />
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={selected.notes ?? ""}
                    onChange={(e) => updateDraft({ notes: e.target.value || null })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={structuredEnabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setStructuredEnabled(on);
                    setDirty(true);
                    if (on && !selected.steps) {
                      updateDraft({ steps: emptyTree(), hasStructuredWorkout: true });
                    } else if (!on) {
                      updateDraft({ hasStructuredWorkout: false });
                    }
                  }}
                />
                Structured workout
              </label>

              {structuredEnabled ? (
                <WorkoutTreeEditor
                  discipline={discipline}
                  displayUnit={unitSettings.displayUnit}
                  poolSize={poolSize}
                  tree={selected.steps ?? emptyTree()}
                  onChange={(tree) =>
                    updateDraft({
                      steps: tree,
                      hasStructuredWorkout: tree.nodes.length > 0,
                    })
                  }
                  thresholdPaceSeconds={paceCtx?.paceSeconds ?? null}
                  thresholdFtpWatts={paceCtx?.ftpWatts ?? null}
                  racePaces={racePaces}
                />
              ) : (
                <p className="text-sm text-zinc-500">
                  Skeleton session — no step targets. Enable structured workout to edit the tree.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={savingSession || !dirty}
                  onClick={() => void saveSession()}
                >
                  {savingSession ? "Saving…" : "Save session"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sessions.length <= 1}
                  onClick={() => void deleteSession()}
                >
                  Delete session
                </Button>
              </div>
            </>
          )}
        </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {applyOpen ? (
        <ApplyTrainingPlanDialog
          plan={applyPlanItem}
          onClose={() => setApplyOpen(false)}
          onApplied={() => {
            setApplyOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
