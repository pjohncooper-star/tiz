import type { Discipline } from "@prisma/client";
import type { WorkoutStep, ZoneMinutes } from "@/lib/workout/workout-types";
import {
  flattenTreeToLegacySteps,
  parseWorkoutTree,
  rollupTreeToZoneMinutes,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

export type { WorkoutStep, WorkoutStepType, ZoneMinutes } from "@/lib/workout/workout-types";
export type { WorkoutTreeDocument } from "@/lib/workout/workout-tree";
export {
  defaultLeafStep,
  defaultRampStep,
  defaultRepeatBlock,
  flattenForPlanning,
  flattenTreeToLegacySteps,
  formatDurationSeconds,
  intensityLabel,
  parseWorkoutNodes,
  parseWorkoutTree,
  primarySignalForDiscipline,
  rollupTreeToZoneMinutes,
  serializeWorkoutTree,
  targetZoneFromTarget,
  totalTreeDurationMinutes,
  totalTreeDurationSeconds,
  WORKOUT_TREE_VERSION,
} from "@/lib/workout/workout-tree";
export type {
  FlatPlanningStep,
  LeafStep,
  RampStep,
  RepeatBlock,
  StepDuration,
  StepIntensity,
  StepTarget,
  TargetMode,
  TargetSignal,
  WorkoutNode,
} from "@/lib/workout/workout-tree";

export function parseWorkoutSteps(raw: unknown): WorkoutStep[] {
  return flattenTreeToLegacySteps(raw);
}

export function parseStructuredWorkout(raw: unknown): WorkoutTreeDocument {
  return parseWorkoutTree(raw);
}

export function rollupStepsToZoneMinutes(steps: WorkoutStep[]): ZoneMinutes {
  const totals: ZoneMinutes = {};
  for (const step of steps) {
    if (step.type === "rest") continue;
    const key = String(step.targetZone);
    totals[key] = (totals[key] ?? 0) + step.durationMinutes;
  }
  return totals;
}

export function rollupStructuredStepsToZoneMinutes(raw: unknown): ZoneMinutes {
  return rollupTreeToZoneMinutes(raw);
}

export function parseTargetZones(raw: unknown): ZoneMinutes {
  if (!raw || typeof raw !== "object") return {};
  const totals: ZoneMinutes = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const zone = Number(key);
    const minutes = Number(value);
    if (Number.isInteger(zone) && zone >= 1 && zone <= 7 && Number.isFinite(minutes) && minutes > 0) {
      totals[zone] = minutes;
    }
  }
  return totals;
}

export function totalZoneMinutes(zones: ZoneMinutes): number {
  return Object.values(zones).reduce((sum, m) => sum + m, 0);
}

export function zoneKey(discipline: Discipline | string, zone: number): string {
  return `${discipline}-${zone}`;
}

export function emptyZoneBudget(disciplines: Discipline[] = ["BIKE", "RUN", "SWIM"]): ZoneMinutes {
  const budget: ZoneMinutes = {};
  for (const d of disciplines) {
    for (let z = 1; z <= 5; z++) {
      budget[zoneKey(d, z)] = 0;
    }
  }
  return budget;
}

/** Merge zone-minute maps keyed as `DISCIPLINE-zone` or numeric zone only. */
export function mergeZoneBudgets(...maps: Array<ZoneMinutes | Record<string, number>>): ZoneMinutes {
  const out: ZoneMinutes = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      if (!Number.isFinite(value) || value <= 0) continue;
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

export function formatZoneMinutes(minutes: number): string {
  if (minutes < 1) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.round(minutes)}m`;
}
