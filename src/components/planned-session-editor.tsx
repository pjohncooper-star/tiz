"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PlannedSessionStats } from "@/components/planned-session-stats";
import { PoolSizeSlider } from "@/components/pool-size-slider";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
import {
  emptyZoneMinuteValues,
  parseZoneMinuteValues,
  zoneMinuteValuesFromDisciplineZones,
  zoneMinuteValuesFromRecord,
  ZoneMinutePills,
  type ZoneMinuteValues,
} from "@/components/zone-minute-pills";
import {
  defaultLeafStep,
  flattenForPlanning,
  serializeWorkoutTree,
  totalTreeDurationMinutes,
  WORKOUT_TREE_VERSION,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { derivePlannedMetricsFromPlanningSteps } from "@/lib/workout/planned-metrics-from-steps";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import { sessionBudgetRollup } from "@/lib/plan/rollup";
import { buildSessionTargetZones, hasTargetZones } from "@/lib/plan/session-target-zones";
import { validateCompletedZoneAllocation } from "@/lib/plan/session-completion";
import type { Discipline } from "@prisma/client";
import {
  defaultSessionTitle,
  titleMatchesSportDefault,
  type PlanDiscipline,
} from "@/lib/plan/session";
import {
  type DisciplineUnitSettings,
  poolSizeForSwimStep,
  swimDisplayUnit,
  type PoolSize,
  unitSettingsForDiscipline,
} from "@/lib/units/discipline-settings";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import { parseTargetZones } from "@/lib/workout/steps";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { sessionReturnLabel } from "@/lib/plan/session-return";

type PlannedSessionEditorProps = {
  sessionId: string;
  scheduledDate: string;
  discipline: Discipline;
  title: string;
  notes: string;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: PoolSize | null;
  targetZones: unknown;
  hasStructuredWorkout: boolean;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  completed: CompletedSessionSnapshot;
  activityCompleted?: CompletedSessionSnapshot | null;
  linkedActivityId?: string | null;
  hasCompletedOverride?: boolean;
  initialCompletedZones?: unknown;
  workoutTree?: WorkoutTreeDocument;
  thresholdPaceSeconds?: number | null;
  thresholdZoneBoundaries?: number[];
  primarySignal?: import("@prisma/client").SignalType | null;
  sessionSource?: "FLEXIBLE" | "ANCHORED_INSTANCE" | "TEMPLATE" | "RACE";
  returnHref: string;
  children?: ReactNode;
};

export function PlannedSessionEditor({
  sessionId,
  scheduledDate: initialDate,
  discipline: initialDiscipline,
  title: initialTitle,
  notes: initialNotes,
  distanceMeters: initialDistanceMeters,
  targetSpeedMps: initialTargetSpeedMps,
  targetPaceSeconds: initialTargetPaceSeconds,
  poolSize: initialPoolSize,
  targetZones: initialTargetZones,
  hasStructuredWorkout: initialHasStructuredWorkout,
  disciplineSettings,
  completed,
  activityCompleted = null,
  linkedActivityId = null,
  hasCompletedOverride: initialHasCompletedOverride = false,
  initialCompletedZones,
  workoutTree: initialWorkoutTree,
  thresholdPaceSeconds = null,
  thresholdZoneBoundaries,
  primarySignal = null,
  sessionSource = "FLEXIBLE",
  returnHref,
  children,
}: PlannedSessionEditorProps) {
  const router = useRouter();
  const returnLabel = sessionReturnLabel(returnHref);
  const initialBudget = sessionBudgetRollup(initialDiscipline, initialTargetZones);
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [discipline, setDiscipline] = useState<Discipline>(initialDiscipline);
  const unitSettings =
    discipline === "STRENGTH"
      ? { displayUnit: "METRIC" as const, poolSize: null }
      : unitSettingsForDiscipline(discipline as PlanDiscipline, disciplineSettings);
  const [poolSize, setPoolSize] = useState<PoolSize>(() =>
    poolSizeForSwimStep(initialPoolSize ?? unitSettings.poolSize)
  );
  const displayUnit =
    discipline === "SWIM" ? swimDisplayUnit(poolSize) : unitSettings.displayUnit;
  const sessionPoolSize = discipline === "SWIM" ? poolSize : null;
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(initialDistanceMeters);
  const [targetSpeedMps, setTargetSpeedMps] = useState<number | null>(initialTargetSpeedMps);
  const [targetPaceSeconds, setTargetPaceSeconds] = useState<number | null>(
    initialTargetPaceSeconds
  );
  const [zoneMinutes, setZoneMinutes] = useState<ZoneMinuteValues>(() =>
    zoneMinuteValuesFromRecord(parseTargetZones(initialTargetZones))
  );
  const [metricsFromSteps, setMetricsFromSteps] = useState(initialHasStructuredWorkout);
  const [plannedTriad, setPlannedTriad] = useState<PlannedMetricsTriadValues>(() => ({
    durationMinutes:
      initialBudget.durationMinutes > 0 ? initialBudget.durationMinutes : null,
    distanceMeters: initialDistanceMeters,
    targetSpeedMps: initialTargetSpeedMps,
    targetPaceSeconds: initialTargetPaceSeconds,
  }));
  const [completedTriad, setCompletedTriad] = useState<PlannedMetricsTriadValues>(() => ({
    durationMinutes: completed.canonical?.durationMinutes ?? null,
    distanceMeters: completed.canonical?.distanceMeters ?? null,
    targetSpeedMps: completed.canonical?.targetSpeedMps ?? null,
    targetPaceSeconds: completed.canonical?.targetPaceSeconds ?? null,
  }));
  const [completedZoneMinutes, setCompletedZoneMinutes] = useState<ZoneMinuteValues>(() => {
    if (initialCompletedZones) {
      return zoneMinuteValuesFromRecord(parseTargetZones(initialCompletedZones));
    }
    return zoneMinuteValuesFromDisciplineZones(completed.zoneMinutes, initialDiscipline);
  });
  const [hasCompletedOverride, setHasCompletedOverride] = useState(initialHasCompletedOverride);
  const [hasWorkout, setHasWorkout] = useState(initialHasStructuredWorkout);
  const [workoutTree, setWorkoutTree] = useState<WorkoutTreeDocument | null>(
    initialHasStructuredWorkout && initialWorkoutTree ? initialWorkoutTree : null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!metricsFromSteps || !hasWorkout || !workoutTree || discipline === "STRENGTH") return;

    const durationMinutes = totalTreeDurationMinutes(workoutTree.nodes);
    if (discipline === "BIKE") {
      setPlannedTriad((prev) => ({
        durationMinutes,
        distanceMeters: prev.distanceMeters,
        targetSpeedMps: prev.targetSpeedMps,
        targetPaceSeconds: null,
      }));
      return;
    }

    if (discipline !== "RUN" && discipline !== "SWIM") return;
    const derived = derivePlannedMetricsFromPlanningSteps(
      discipline,
      flattenForPlanning(workoutTree.nodes),
      { thresholdPaceSeconds, zoneBoundaries: thresholdZoneBoundaries }
    );
    setDistanceMeters(derived.distanceMeters);
    setTargetPaceSeconds(derived.targetPaceSeconds);
    setPlannedTriad({
      durationMinutes: durationMinutes > 0 ? durationMinutes : null,
      distanceMeters: derived.distanceMeters,
      targetSpeedMps: null,
      targetPaceSeconds: derived.targetPaceSeconds,
    });
  }, [
    workoutTree,
    hasWorkout,
    discipline,
    thresholdPaceSeconds,
    thresholdZoneBoundaries,
    metricsFromSteps,
  ]);

  const [deleting, setDeleting] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function serializeTree(tree: WorkoutTreeDocument) {
    return serializeWorkoutTree(tree);
  }

  function buildTargetZonesPayload():
    | { ok: true; zones: Record<string, number> | null }
    | { ok: false } {
    const zones = parseZoneMinuteValues(zoneMinutes);
    const zoneSum = Object.values(zones).reduce((s, m) => s + m, 0);
    if (
      plannedTriad.durationMinutes != null &&
      zoneSum > plannedTriad.durationMinutes
    ) {
      setError("Zone minutes cannot exceed duration");
      return { ok: false };
    }
    const payload = buildSessionTargetZones(zones, plannedTriad.durationMinutes);
    return { ok: true, zones: hasTargetZones(payload) ? payload : null };
  }

  function buildCompletedPayload():
    | { ok: true; clear: true }
    | { ok: true; data: Record<string, unknown> }
    | { ok: false } {
    const zones = parseZoneMinuteValues(completedZoneMinutes);
    const zoneError = validateCompletedZoneAllocation(
      zones,
      completedTriad.durationMinutes
    );
    if (zoneError) {
      setError(zoneError);
      return { ok: false };
    }

    const completedZonesPayload = buildSessionTargetZones(
      zones,
      completedTriad.durationMinutes
    );
    const hasAny =
      (completedTriad.durationMinutes != null && completedTriad.durationMinutes > 0) ||
      (completedTriad.distanceMeters != null && completedTriad.distanceMeters > 0) ||
      (discipline === "BIKE" &&
        completedTriad.targetSpeedMps != null &&
        completedTriad.targetSpeedMps > 0) ||
      (discipline !== "BIKE" &&
        completedTriad.targetPaceSeconds != null &&
        completedTriad.targetPaceSeconds > 0) ||
      hasTargetZones(completedZonesPayload);

    if (!hasAny) {
      return { ok: true, clear: true };
    }

    return {
      ok: true,
      data: {
        completedDurationMinutes: completedTriad.durationMinutes,
        completedDistanceMeters: completedTriad.distanceMeters,
        completedTargetSpeedMps:
          discipline === "BIKE" ? completedTriad.targetSpeedMps : null,
        completedTargetPaceSeconds:
          discipline === "BIKE" ? null : completedTriad.targetPaceSeconds,
        completedZones: hasTargetZones(completedZonesPayload)
          ? completedZonesPayload
          : null,
      },
    };
  }

  async function persistSession(): Promise<boolean> {
    if (!title.trim()) {
      setError("Title is required");
      return false;
    }

    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      scheduledDate,
      discipline,
      title: title.trim(),
      notes: notes.trim() || null,
      distanceMeters,
      targetSpeedMps: discipline === "BIKE" ? targetSpeedMps : null,
      targetPaceSeconds: discipline === "BIKE" ? null : targetPaceSeconds,
      poolSize: discipline === "SWIM" ? poolSize : null,
    };

    if (discipline !== "STRENGTH") {
      const budget = buildTargetZonesPayload();
      if (!budget.ok) {
        setSaving(false);
        return false;
      }
      body.targetZones = budget.zones;

      const completedPayload = buildCompletedPayload();
      if (!completedPayload.ok) {
        setSaving(false);
        return false;
      }
      if ("clear" in completedPayload && completedPayload.clear) {
        body.clearCompletedOverrides = true;
        setHasCompletedOverride(false);
      } else if ("data" in completedPayload) {
        Object.assign(body, completedPayload.data);
        setHasCompletedOverride(true);
      }
    }

    if (hasWorkout && workoutTree) {
      body.steps = serializeTree(workoutTree);
    } else if (initialHasStructuredWorkout) {
      body.steps = { version: WORKOUT_TREE_VERSION, nodes: [] };
    }

    const res = await fetch(`/api/plan/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Could not save session");
      return false;
    }

    router.refresh();
    return true;
  }

  async function handleSave(e: React.FormEvent, stayOnPage = false) {
    e.preventDefault();
    const ok = await persistSession();
    if (ok && !stayOnPage) {
      router.push(returnHref);
    }
  }

  async function handleDelete() {
    const linkedActivityName = activityCompleted?.activities[0]?.name;
    const confirmMessage = linkedActivityId
      ? linkedActivityName
        ? `Delete "${title}" and the linked workout "${linkedActivityName}"? This cannot be undone.`
        : `Delete "${title}" and the linked completed workout? This cannot be undone.`
      : `Delete "${title}"? This cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    setDeleting(true);
    const res = await fetch(`/api/plan/sessions/${sessionId}`, { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      setError("Could not delete session");
      return;
    }

    router.push(returnHref);
    router.refresh();
  }

  async function handleDetach() {
    setDetaching(true);
    setError(null);
    const res = await fetch(`/api/plan/sessions/${sessionId}/detach`, { method: "POST" });
    setDetaching(false);
    if (!res.ok) {
      setError("Could not detach from anchor");
      return;
    }
    router.refresh();
  }

  async function handleResetCompletedToActivity() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearCompletedOverrides: true }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not reset completed metrics");
      return;
    }

    const fallback = activityCompleted ?? completed;
    setHasCompletedOverride(false);
    setCompletedTriad({
      durationMinutes: fallback.canonical?.durationMinutes ?? null,
      distanceMeters: fallback.canonical?.distanceMeters ?? null,
      targetSpeedMps: fallback.canonical?.targetSpeedMps ?? null,
      targetPaceSeconds: fallback.canonical?.targetPaceSeconds ?? null,
    });
    setCompletedZoneMinutes(
      zoneMinuteValuesFromDisciplineZones(fallback.zoneMinutes, discipline)
    );
    router.refresh();
  }

  function handleBuildWorkout() {
    setHasWorkout(true);
    setMetricsFromSteps(true);
    setWorkoutTree({ version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] });
  }

  function handleRemoveWorkout() {
    if (!confirm("Remove the structured workout from this session? TiZ budget is unchanged.")) {
      return;
    }
    setHasWorkout(false);
    setWorkoutTree(null);
    setMetricsFromSteps(false);
  }

  const totalMinutes = workoutTree ? totalTreeDurationMinutes(workoutTree.nodes) : 0;
  const durationCap = plannedTriad.durationMinutes ?? null;

  function handlePlannedTriadChange(values: PlannedMetricsTriadValues) {
    setMetricsFromSteps(false);
    setPlannedTriad(values);
    setDistanceMeters(values.distanceMeters);
    if (discipline === "BIKE") {
      setTargetSpeedMps(values.targetSpeedMps);
      setTargetPaceSeconds(null);
    } else {
      setTargetPaceSeconds(values.targetPaceSeconds);
      setTargetSpeedMps(null);
    }
  }

  const liveTargetZones = buildSessionTargetZones(
    parseZoneMinuteValues(zoneMinutes),
    plannedTriad.durationMinutes
  );

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card title="Summary">
        {sessionSource === "ANCHORED_INSTANCE" && (
          <p className="mb-3 text-xs font-medium text-sky-700 dark:text-sky-400">
            Anchored session — edits here affect this instance only. Detach to make it a flexible session.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Sport</Label>
            <Select
              value={discipline}
              onChange={(e) => {
                const next = e.target.value as Discipline;
                if (next !== "STRENGTH") {
                  setTitle((prev) =>
                    titleMatchesSportDefault(prev, discipline as PlanDiscipline)
                      ? defaultSessionTitle(next as PlanDiscipline)
                      : prev
                  );
                }
                if (next === "BIKE") setTargetPaceSeconds(null);
                else if (next === "RUN") setTargetSpeedMps(null);
                else if (next === "SWIM") {
                  setTargetSpeedMps(null);
                  setPoolSize(poolSizeForSwimStep(disciplineSettings.SWIM?.poolSize));
                } else if (next === "STRENGTH") {
                  setTargetPaceSeconds(null);
                  setTargetSpeedMps(null);
                  setDistanceMeters(null);
                  setZoneMinutes(emptyZoneMinuteValues());
                }
                setDiscipline(next);
              }}
            >
              <option value="BIKE">Bike</option>
              <option value="RUN">Run</option>
              <option value="SWIM">Swim</option>
              <option value="STRENGTH">Strength</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {discipline === "SWIM" ? (
            <div className="sm:col-span-2">
              <Label>Pool size</Label>
              <PoolSizeSlider
                className="mt-2 max-w-sm"
                value={poolSize}
                onChange={setPoolSize}
              />
            </div>
          ) : null}
        </div>

        {discipline === "STRENGTH" ? (
          <p className="mt-4 text-sm text-zinc-500">
            Strength session — duration from workout steps; not counted toward endurance TiZ targets.
          </p>
        ) : (
          <>
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <Label>TiZ budget (zone minutes)</Label>
              {hasWorkout && (
                <p className="mt-1 text-xs text-zinc-500">
                  Zone totals and charts use the structured workout. TiZ budget is not applied
                  while a workout is attached.
                </p>
              )}
              <div className="mt-2">
                <ZoneMinutePills
                  values={zoneMinutes}
                  maxTotalMinutes={durationCap}
                  onChange={(zone, value) =>
                    setZoneMinutes((prev) => ({ ...prev, [zone]: value }))
                  }
                />
              </div>
            </div>
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <PlannedSessionStats
                discipline={discipline as PlanDiscipline}
                displayUnit={displayUnit}
                poolSize={sessionPoolSize}
                targetZones={liveTargetZones}
                structuredSteps={
                  hasWorkout && workoutTree ? serializeTree(workoutTree) : undefined
                }
                thresholdPaceSeconds={thresholdPaceSeconds}
                plannedTriad={plannedTriad}
                completedTriad={completedTriad}
                onPlannedTriadChange={handlePlannedTriadChange}
                onCompletedTriadChange={setCompletedTriad}
                completedZoneMinutes={completedZoneMinutes}
                onCompletedZoneMinutesChange={(zone, value) =>
                  setCompletedZoneMinutes((prev) => ({ ...prev, [zone]: value }))
                }
                linkedActivityId={linkedActivityId}
                hasCompletedOverride={hasCompletedOverride}
                onResetCompletedToActivity={
                  linkedActivityId ? handleResetCompletedToActivity : undefined
                }
                completed={completed}
              />
            </div>
          </>
        )}

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <Label>Notes</Label>
          <textarea
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Card>

      {children}

      <Card title={hasWorkout ? `Workout steps · ${totalMinutes} min total` : "Structured workout"}>
        {hasWorkout && workoutTree ? (
          <>
            <WorkoutTreeEditor
              discipline={discipline}
              displayUnit={displayUnit}
              poolSize={sessionPoolSize}
              tree={workoutTree}
              onChange={setWorkoutTree}
              thresholdPaceSeconds={thresholdPaceSeconds}
              primarySignal={primarySignal}
            />
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <Button type="button" variant="secondary" onClick={handleRemoveWorkout}>
                Remove workout
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">No structured workout yet.</p>
            <Button type="button" variant="secondary" onClick={handleBuildWorkout}>
              Build workout
            </Button>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving || deleting}
          onClick={(e) => void handleSave(e, true)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="submit" disabled={saving || deleting}>
          {saving ? "Saving…" : `Save & back to ${returnLabel}`}
        </Button>
        <Link href={returnHref}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        {hasWorkout && (
          <>
            <a href={`/api/plan/sessions/${sessionId}/export?format=fit`}>
              <Button type="button" variant="secondary">
                Export FIT
              </Button>
            </a>
            <a href={`/api/plan/sessions/${sessionId}/export?format=zwo`}>
              <Button type="button" variant="secondary">
                Export ZWO
              </Button>
            </a>
          </>
        )}
        {sessionSource === "ANCHORED_INSTANCE" && (
          <Button
            type="button"
            variant="secondary"
            disabled={saving || deleting || detaching}
            onClick={handleDetach}
          >
            {detaching ? "Detaching…" : "Detach from anchor"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="text-red-600"
          disabled={saving || deleting}
          onClick={handleDelete}
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </form>
  );
}
