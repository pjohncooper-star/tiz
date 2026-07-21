"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlannedSessionStats } from "@/components/planned-session-stats";
import { PoolSizeSlider } from "@/components/pool-size-slider";
import { WorkoutTreeEditor } from "@/components/workout-tree-editor";
import { SessionZoneBudget } from "@/components/session-zone-budget";
import {
  emptyZoneMinuteValues,
  fitZoneMinuteValuesToDuration,
  parseZoneMinuteValues,
  totalZoneMinuteInputValues,
  zoneMinuteValuesFromDisciplineZones,
  zoneMinuteValuesFromRecord,
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
import type { Discipline, SessionRole, SignalType } from "@prisma/client";
import {
  defaultSessionTitle,
  titleMatchesSportDefault,
  type PlanDiscipline,
} from "@/lib/plan/session";
import {
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
} from "@/lib/plan/session-role";
import { allowedPrimarySignals } from "@/lib/zones/signal-preference";
import { signalLabel } from "@/lib/zones/display";
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
  primarySignal?: SignalType | null;
  inheritedPrimarySignal?: SignalType | null;
  sessionRole?: SessionRole;
  tizSignalOverride?: SignalType | null;
  sessionSource?: "FLEXIBLE" | "TEMPLATE" | "RACE";
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
  inheritedPrimarySignal = null,
  sessionRole: initialSessionRole = "MODERATE",
  tizSignalOverride: initialTizSignalOverride = null,
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
  const [sessionRole, setSessionRole] = useState<SessionRole>(initialSessionRole);
  const [tizSignalOverride, setTizSignalOverride] = useState<SignalType | null>(
    initialTizSignalOverride
  );
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
  const [completedDirty, setCompletedDirty] = useState(false);
  const hasCompletedOverride = initialHasCompletedOverride || completedDirty;
  const [hasWorkout, setHasWorkout] = useState(initialHasStructuredWorkout);
  const [workoutTree, setWorkoutTree] = useState<WorkoutTreeDocument | null>(
    initialHasStructuredWorkout && initialWorkoutTree ? initialWorkoutTree : null
  );
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

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
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  function serializeTree(tree: WorkoutTreeDocument) {
    return serializeWorkoutTree(tree);
  }

  function buildTargetZonesPayload():
    | { ok: true; zones: Record<string, number> | null }
    | { ok: false } {
    const fittedZoneMinutes = fitZoneMinuteValuesToDuration(
      zoneMinutes,
      plannedTriad.durationMinutes
    );
    const zones = parseZoneMinuteValues(fittedZoneMinutes);
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

  function applySavedSession(saved: {
    discipline: Discipline;
    targetZones: unknown;
    distanceMeters: number | null;
    targetSpeedMps: number | null;
    targetPaceSeconds: number | null;
    poolSize: PoolSize | null;
  }) {
    const budget = sessionBudgetRollup(saved.discipline, saved.targetZones);
    const nextZones = zoneMinuteValuesFromRecord(parseTargetZones(saved.targetZones));
    setZoneMinutes(nextZones);
    setDistanceMeters(saved.distanceMeters);
    setTargetSpeedMps(saved.targetSpeedMps);
    setTargetPaceSeconds(saved.targetPaceSeconds);
    if (saved.discipline === "SWIM" && saved.poolSize) {
      setPoolSize(saved.poolSize);
    }
    setPlannedTriad({
      durationMinutes: budget.durationMinutes > 0 ? budget.durationMinutes : null,
      distanceMeters: saved.distanceMeters,
      targetSpeedMps: saved.discipline === "BIKE" ? saved.targetSpeedMps : null,
      targetPaceSeconds: saved.discipline === "BIKE" ? null : saved.targetPaceSeconds,
    });
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
      sessionRole,
      tizSignalOverride: discipline === "STRENGTH" ? null : tizSignalOverride,
      distanceMeters: plannedTriad.distanceMeters,
      targetSpeedMps: discipline === "BIKE" ? plannedTriad.targetSpeedMps : null,
      targetPaceSeconds: discipline === "BIKE" ? null : plannedTriad.targetPaceSeconds,
      poolSize: discipline === "SWIM" ? poolSize : null,
    };

    if (discipline !== "STRENGTH") {
      const budget = buildTargetZonesPayload();
      if (!budget.ok) {
        setSaving(false);
        return false;
      }
      body.targetZones = budget.zones;

      if (completedDirty) {
        const completedPayload = buildCompletedPayload();
        if (!completedPayload.ok) {
          setSaving(false);
          return false;
        }
        if ("clear" in completedPayload && completedPayload.clear) {
          body.clearCompletedOverrides = true;
          setCompletedDirty(false);
        } else if ("data" in completedPayload) {
          Object.assign(body, completedPayload.data);
        }
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
      let message = "Could not save session";
      try {
        const data = (await res.json()) as { error?: unknown };
        if (typeof data.error === "string") {
          message = data.error;
        } else if (data.error && typeof data.error === "object") {
          const flattened = data.error as {
            fieldErrors?: Record<string, string[] | undefined>;
            formErrors?: string[];
          };
          const fieldMessage = Object.values(flattened.fieldErrors ?? {})
            .flat()
            .find((value): value is string => typeof value === "string" && value.length > 0);
          message =
            fieldMessage ??
            flattened.formErrors?.[0] ??
            "Could not save session — check your inputs";
        }
      } catch {
        // ignore parse errors
      }
      setError(message);
      return false;
    }

    try {
      const data = (await res.json()) as {
        session?: {
          discipline: Discipline;
          targetZones: unknown;
          distanceMeters: number | null;
          targetSpeedMps: number | null;
          targetPaceSeconds: number | null;
          poolSize: PoolSize | null;
        };
      };
      if (data.session) {
        applySavedSession(data.session);
      }
    } catch {
      setZoneMinutes(
        fitZoneMinuteValuesToDuration(zoneMinutes, plannedTriad.durationMinutes)
      );
    }

    setCompletedDirty(false);
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

  async function handleUnlinkActivity() {
    if (!linkedActivityId || unlinking) return;
    setUnlinking(true);
    setError(null);
    const res = await fetch(`/api/plan/sessions/${sessionId}/link`, { method: "DELETE" });
    setUnlinking(false);
    if (!res.ok) {
      setError("Could not unlink activity");
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
    setCompletedDirty(false);
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

  function handleCompletedTriadChange(values: PlannedMetricsTriadValues) {
    setCompletedDirty(true);
    setCompletedTriad(values);
  }

  function handleCompletedZoneMinutesChange(
    zone: import("@/components/zone-minute-pills").ZoneNumber,
    value: string
  ) {
    setCompletedDirty(true);
    setCompletedZoneMinutes((prev) => ({ ...prev, [zone]: value }));
  }

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
    if (
      values.durationMinutes != null &&
      values.durationMinutes > 0 &&
      totalZoneMinuteInputValues(zoneMinutes) > values.durationMinutes
    ) {
      setZoneMinutes(
        fitZoneMinuteValuesToDuration(zoneMinutes, values.durationMinutes)
      );
    }
  }

  function handlePlannedZoneMinutesChange(
    zone: import("@/components/zone-minute-pills").ZoneNumber,
    value: string
  ) {
    setMetricsFromSteps(false);
    setZoneMinutes((prev) => ({ ...prev, [zone]: value }));
  }

  const fittedZoneMinutes = fitZoneMinuteValuesToDuration(
    zoneMinutes,
    plannedTriad.durationMinutes
  );
  const liveTargetZones = buildSessionTargetZones(
    parseZoneMinuteValues(fittedZoneMinutes),
    plannedTriad.durationMinutes
  );
  const structuredWorkoutActive = hasWorkout && !!workoutTree;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card title="Summary">
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
          {discipline !== "STRENGTH" ? (
            <>
              <div>
                <Label>Session role</Label>
                <Select
                  value={sessionRole}
                  onChange={(e) => setSessionRole(e.target.value as SessionRole)}
                >
                  {SESSION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {SESSION_ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </div>
              {allowedPrimarySignals(discipline).length > 1 ? (
                <div>
                  <Label>TiZ metric</Label>
                  <Select
                    value={tizSignalOverride ?? "DEFAULT"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTizSignalOverride(
                        v === "DEFAULT" ? null : (v as SignalType)
                      );
                    }}
                  >
                    <option value="DEFAULT">
                      Default
                      {inheritedPrimarySignal
                        ? ` (${signalLabel(inheritedPrimarySignal)})`
                        : primarySignal
                          ? ` (${signalLabel(primarySignal)})`
                          : ""}
                    </option>
                    {allowedPrimarySignals(discipline).map((signal) => (
                      <option key={signal} value={signal}>
                        {signalLabel(signal)}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Optional. Overrides role and discipline defaults for this session only.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
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
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <PlannedSessionStats
              discipline={discipline as PlanDiscipline}
              displayUnit={displayUnit}
              poolSize={sessionPoolSize}
              targetZones={liveTargetZones}
              structuredSteps={
                structuredWorkoutActive ? serializeTree(workoutTree!) : undefined
              }
              thresholdPaceSeconds={thresholdPaceSeconds}
              thresholdZoneBoundaries={thresholdZoneBoundaries}
              plannedTriad={plannedTriad}
              completedTriad={completedTriad}
              onPlannedTriadChange={handlePlannedTriadChange}
              onCompletedTriadChange={handleCompletedTriadChange}
              completedZoneMinutes={completedZoneMinutes}
              onCompletedZoneMinutesChange={handleCompletedZoneMinutesChange}
              plannedZoneMinutes={zoneMinutes}
              onPlannedZoneMinutesChange={handlePlannedZoneMinutesChange}
              plannedZoneBudgetMinutes={durationCap}
              hidePlannedZonePills={structuredWorkoutActive}
              structuredWorkoutWarning={
                structuredWorkoutActive
                  ? "Zone totals use the structured workout. TiZ budget pills are hidden while a workout is attached."
                  : null
              }
              linkedActivityId={linkedActivityId}
              hasCompletedOverride={hasCompletedOverride}
              onResetCompletedToActivity={
                linkedActivityId ? handleResetCompletedToActivity : undefined
              }
              completed={completed}
            />
          </div>
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
            <SessionZoneBudget
              sessionId={sessionId}
              scheduledDate={scheduledDate}
              discipline={discipline}
              workoutTree={workoutTree}
              thresholdPaceSeconds={thresholdPaceSeconds}
              thresholdZoneBoundaries={thresholdZoneBoundaries}
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

      {error && (
        <p ref={errorRef} className="text-sm text-red-600">
          {error}
        </p>
      )}

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
        {linkedActivityId ? (
          <Button
            type="button"
            variant="secondary"
            disabled={saving || deleting || unlinking}
            onClick={() => void handleUnlinkActivity()}
          >
            {unlinking ? "Unlinking…" : "Unlink activity"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="text-red-600"
          disabled={saving || deleting || unlinking}
          onClick={handleDelete}
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </form>
  );
}
