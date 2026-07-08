import type { TargetDiscipline } from "@/components/calendar/types";
import {
  primarySignalForDiscipline,
  totalTreeDurationMinutes,
  WORKOUT_TREE_VERSION,
  type LeafStep,
  type StepIntensity,
  type TargetSignal,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

export type GeneratedWorkoutKind = "interval" | "priming";
export type PrimingKind = "strides" | "spin_ups";

/** Default work-interval length per hard zone, in seconds. */
export const DEFAULT_WORK_LEN_SECONDS: Record<number, number> = {
  3: 300,
  4: 180,
  5: 60,
};

/** Default recovery length between work intervals per hard zone, in seconds. */
export const DEFAULT_REST_LEN_SECONDS: Record<number, number> = {
  3: 120,
  4: 120,
  5: 120,
};

const HARD_ZONES = [3, 4, 5] as const;

const PRIMING_DEFAULTS: Record<
  PrimingKind,
  { discipline: TargetDiscipline; reps: number; workLenSeconds: number; restLenSeconds: number }
> = {
  strides: { discipline: "RUN", reps: 6, workLenSeconds: 20, restLenSeconds: 40 },
  spin_ups: { discipline: "BIKE", reps: 6, workLenSeconds: 30, restLenSeconds: 60 },
};

const PRIMING_LABELS: Record<PrimingKind, string> = {
  strides: "Strides",
  spin_ups: "Spin-ups",
};

export type GeneratedWorkout = {
  id: string;
  kind: GeneratedWorkoutKind;
  discipline: TargetDiscipline;
  zone: number;
  reps: number;
  workLenSeconds: number;
  restLenSeconds: number;
  /** Include a warmup + cooldown around the work set (intervals only). */
  withWarmup: boolean;
  primingKind?: PrimingKind;
  label: string;
  durationMinutes: number;
  /** Precise work minutes in the target zone (reps x workLen). */
  zoneMinutes: number;
  tree: WorkoutTreeDocument;
};

export type DisciplineBudget = {
  discipline: TargetDiscipline;
  intenseDaysPerWeek: number;
  /** Remaining minutes per zone (only zones 3-5 are used for intervals). */
  remainingByZone: Record<number, number>;
};

/** Round a seconds value to the nearest 15s, minimum 15s. */
export function roundToQuarterMinute(seconds: number): number {
  return Math.max(15, Math.round(seconds / 15) * 15);
}

function repsForTarget(targetMinutes: number, workLenSeconds: number): number {
  if (workLenSeconds <= 0) return 1;
  return Math.max(1, Math.round((targetMinutes * 60) / workLenSeconds));
}

/** Work minutes in the target zone for a given rep/length pair. */
export function intervalZoneMinutes(reps: number, workLenSeconds: number): number {
  return Math.round(((reps * workLenSeconds) / 60) * 10) / 10;
}

/** Format an interval length: `3'`, `20"`, or `1'30"`. */
export function formatIntervalLength(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins > 0 && secs === 0) return `${mins}'`;
  if (mins === 0) return `${secs}"`;
  return `${mins}'${secs.toString().padStart(2, "0")}"`;
}

function intervalLabel(reps: number, workLenSeconds: number, zone: number): string {
  return `${reps}x${formatIntervalLength(workLenSeconds)} Z${zone}`;
}

function primingLabel(primingKind: PrimingKind, reps: number, workLenSeconds: number): string {
  return `${PRIMING_LABELS[primingKind]} ${reps}x${formatIntervalLength(workLenSeconds)}`;
}

function stepNode(
  intensity: StepIntensity,
  signal: TargetSignal,
  zone: number,
  seconds: number
): LeafStep {
  return {
    kind: "step",
    intensity,
    duration: { type: "time", value: seconds },
    target: { signal, mode: "zone", zone },
  };
}

function buildIntervalTree(params: {
  discipline: TargetDiscipline;
  zone: number;
  reps: number;
  workLenSeconds: number;
  restLenSeconds: number;
  withWarmup: boolean;
}): WorkoutTreeDocument {
  const signal = primarySignalForDiscipline(params.discipline);
  const nodes: WorkoutNode[] = [];
  if (params.withWarmup) {
    nodes.push(stepNode("warmup", signal, 2, 600));
  }
  nodes.push({
    kind: "repeat",
    repeatCount: params.reps,
    children: [
      stepNode("interval", signal, params.zone, params.workLenSeconds),
      stepNode("recovery", signal, 1, params.restLenSeconds),
    ],
  });
  if (params.withWarmup) {
    nodes.push(stepNode("cooldown", signal, 1, 300));
  }
  return { version: WORKOUT_TREE_VERSION, nodes };
}

function makeInterval(params: {
  id: string;
  discipline: TargetDiscipline;
  zone: number;
  reps: number;
  workLenSeconds: number;
  restLenSeconds: number;
  withWarmup: boolean;
}): GeneratedWorkout {
  const tree = buildIntervalTree(params);
  return {
    id: params.id,
    kind: "interval",
    discipline: params.discipline,
    zone: params.zone,
    reps: params.reps,
    workLenSeconds: params.workLenSeconds,
    restLenSeconds: params.restLenSeconds,
    withWarmup: params.withWarmup,
    label: intervalLabel(params.reps, params.workLenSeconds, params.zone),
    durationMinutes: totalTreeDurationMinutes(tree.nodes),
    zoneMinutes: intervalZoneMinutes(params.reps, params.workLenSeconds),
    tree,
  };
}

function makePriming(id: string, primingKind: PrimingKind, reps?: number): GeneratedWorkout {
  const defaults = PRIMING_DEFAULTS[primingKind];
  const finalReps = Math.max(1, reps ?? defaults.reps);
  const tree = buildIntervalTree({
    discipline: defaults.discipline,
    zone: 5,
    reps: finalReps,
    workLenSeconds: defaults.workLenSeconds,
    restLenSeconds: defaults.restLenSeconds,
    withWarmup: false,
  });
  return {
    id,
    kind: "priming",
    discipline: defaults.discipline,
    zone: 5,
    reps: finalReps,
    workLenSeconds: defaults.workLenSeconds,
    restLenSeconds: defaults.restLenSeconds,
    withWarmup: false,
    primingKind,
    label: primingLabel(primingKind, finalReps, defaults.workLenSeconds),
    durationMinutes: totalTreeDurationMinutes(tree.nodes),
    zoneMinutes: intervalZoneMinutes(finalReps, defaults.workLenSeconds),
    tree,
  };
}

/**
 * Seed the per-week palette: for each discipline and each hard zone with
 * remaining budget, split the budget evenly across the discipline's intense
 * days into single-zone interval cards, then append strides (run) and
 * spin-ups (bike) priming cards.
 */
export function generateWeekPalette(budgets: DisciplineBudget[]): GeneratedWorkout[] {
  const out: GeneratedWorkout[] = [];

  for (const budget of budgets) {
    for (const zone of HARD_ZONES) {
      const remaining = budget.remainingByZone[zone] ?? 0;
      if (remaining <= 0.5) continue;
      const days = Math.max(1, Math.round(budget.intenseDaysPerWeek) || 1);
      const perDay = remaining / days;
      const workLen = DEFAULT_WORK_LEN_SECONDS[zone] ?? 180;
      const restLen = DEFAULT_REST_LEN_SECONDS[zone] ?? 120;
      for (let i = 0; i < days; i++) {
        out.push(
          makeInterval({
            id: `${budget.discipline}-z${zone}-${i}`,
            discipline: budget.discipline,
            zone,
            reps: repsForTarget(perDay, workLen),
            workLenSeconds: workLen,
            restLenSeconds: restLen,
            withWarmup: true,
          })
        );
      }
    }
  }

  for (const budget of budgets) {
    if (budget.discipline === "RUN") {
      out.push(makePriming("RUN-strides", "strides"));
    }
    if (budget.discipline === "BIKE") {
      out.push(makePriming("BIKE-spin_ups", "spin_ups"));
    }
  }

  return out;
}

/**
 * Recompute a card after the user edits reps and/or interval length. Priming
 * cards keep their fixed default work length; only reps are editable there.
 */
export function recomputeWorkout(
  workout: GeneratedWorkout,
  next: { reps?: number; workLenSeconds?: number }
): GeneratedWorkout {
  const reps = Math.max(1, Math.round(next.reps ?? workout.reps));

  if (workout.kind === "priming" && workout.primingKind) {
    return makePriming(workout.id, workout.primingKind, reps);
  }

  return makeInterval({
    id: workout.id,
    discipline: workout.discipline,
    zone: workout.zone,
    reps,
    workLenSeconds: roundToQuarterMinute(next.workLenSeconds ?? workout.workLenSeconds),
    restLenSeconds: workout.restLenSeconds,
    withWarmup: workout.withWarmup,
  });
}

/** Running total of work minutes for a zone across the given cards. */
export function paletteZoneTotal(
  workouts: GeneratedWorkout[],
  discipline: TargetDiscipline,
  zone: number
): number {
  const total = workouts
    .filter((w) => w.discipline === discipline && w.zone === zone)
    .reduce((sum, w) => sum + w.zoneMinutes, 0);
  return Math.round(total * 10) / 10;
}
