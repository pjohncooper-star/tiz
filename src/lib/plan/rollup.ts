import type { Discipline } from "@prisma/client";
import {
  flattenOptionsForDiscipline,
  type PaceThresholdContext,
} from "@/lib/plan/pace-threshold-context";
import {
  flattenForPlanning,
  flatStepDurationSeconds,
  parseWorkoutTree,
  rollupFlatPlanningToZoneMinutes,
  type FlattenPlanningOptions,
} from "@/lib/workout/workout-tree";
import {
  parseTargetZones,
  parseWorkoutSteps,
  totalZoneMinutes,
  zoneKey,
  type ZoneMinutes,
} from "@/lib/workout/steps";
import { DEFAULT_ZONE_COUNT } from "@/lib/zones/boundaries";

const ZONES = [1, 2, 3, 4, 5] as const;

export type SessionZoneRollup = {
  zones: ZoneMinutes;
  totalMinutes: number;
  zoneAllocationMissing: boolean;
  durationMinutes: number;
};

/** Fold zones above Week TiZ's Z5 into Z5 so minutes are not dropped. */
function disciplineZoneMinutes(
  discipline: Discipline,
  rawZones: ZoneMinutes,
  maxZone: number = DEFAULT_ZONE_COUNT
): ZoneMinutes {
  const zones: ZoneMinutes = {};
  for (const [zone, minutes] of Object.entries(rawZones)) {
    if (minutes > 0) {
      const z = Number(zone);
      if (!Number.isFinite(z) || z < 1) continue;
      const displayZone = Math.min(Math.round(z), maxZone);
      const key = zoneKey(discipline, displayZone);
      zones[key] = (zones[key] ?? 0) + minutes;
    }
  }
  return zones;
}

/** TiZ budget rollup from PlannedSession.targetZones only. */
export function sessionBudgetRollup(
  discipline: Discipline,
  targetZones: unknown,
  durationHintMinutes?: number | null
): SessionZoneRollup {
  const fromTarget = parseTargetZones(targetZones);
  const zones = disciplineZoneMinutes(discipline, fromTarget);
  const zoneTotal = totalZoneMinutes(zones);
  const durationMinutes =
    durationHintMinutes != null && durationHintMinutes > 0
      ? durationHintMinutes
      : zoneTotal;
  const zoneAllocationMissing = durationMinutes > 0 && zoneTotal <= 0;

  return {
    zones,
    totalMinutes: zoneTotal,
    zoneAllocationMissing,
    durationMinutes,
  };
}

/** TiZ rollup from structured workout steps only. */
export function workoutZoneRollup(
  discipline: Discipline,
  structuredSteps: unknown,
  options: FlattenPlanningOptions = {}
): SessionZoneRollup {
  const flattenOpts: FlattenPlanningOptions = {
    ...options,
    ...(discipline === "RUN" || discipline === "SWIM"
      ? { discipline: options.discipline ?? discipline }
      : {}),
  };
  const tree = parseWorkoutTree(structuredSteps);
  const flat = flattenForPlanning(tree.nodes, flattenOpts);
  const legacySteps = parseWorkoutSteps(structuredSteps);
  const fromSteps =
    flat.length > 0
      ? rollupFlatPlanningToZoneMinutes(flat)
      : legacySteps.length > 0
        ? rollupFlatPlanningToZoneMinutes(
            legacySteps.map((s) => ({
              type: s.type,
              durationMinutes: s.durationMinutes,
              durationSeconds: s.durationMinutes * 60,
              targetZone: s.targetZone,
              openDuration: false,
            }))
          )
        : {};
  const zones = disciplineZoneMinutes(discipline, fromSteps);

  const durationMinutes =
    flat.length > 0
      ? Math.round(
          flat.reduce((sum, step) => sum + flatStepDurationSeconds(step), 0) / 60
        )
      : legacySteps.length > 0
        ? legacySteps.reduce((s, step) => s + step.durationMinutes, 0)
        : 0;

  const hasOpenWithoutEstimate = flat.some(
    (s) => s.openDuration && s.durationSeconds <= 0
  );
  const zoneAllocationMissing =
    (durationMinutes > 0 && totalZoneMinutes(zones) <= 0) || hasOpenWithoutEstimate;

  return {
    zones,
    totalMinutes: totalZoneMinutes(zones),
    zoneAllocationMissing,
    durationMinutes,
  };
}

function hasStructuredWorkoutContent(structuredSteps: unknown): boolean {
  const tree = parseWorkoutTree(structuredSteps);
  if (flattenForPlanning(tree.nodes).length > 0) return true;
  return parseWorkoutSteps(structuredSteps).length > 0;
}

/** Planned TiZ: workout steps when present, otherwise TiZ budget pills. */
export function sessionPlannedZoneRollup(
  discipline: Discipline,
  options: {
    targetZones?: unknown;
    structuredSteps?: unknown;
    durationHintMinutes?: number | null;
    paceContext?: PaceThresholdContext | null;
    flattenOptions?: FlattenPlanningOptions;
  }
): SessionZoneRollup {
  if (hasStructuredWorkoutContent(options.structuredSteps)) {
    const flattenOptions =
      options.flattenOptions ??
      flattenOptionsForDiscipline(discipline, options.paceContext);
    return workoutZoneRollup(discipline, options.structuredSteps, flattenOptions);
  }
  return sessionBudgetRollup(
    discipline,
    options.targetZones,
    options.durationHintMinutes
  );
}

/** @deprecated Use sessionPlannedZoneRollup instead. */
export function sessionZoneRollup(
  discipline: Discipline,
  targetZones: unknown,
  structuredSteps: unknown
): SessionZoneRollup {
  return sessionPlannedZoneRollup(discipline, { targetZones, structuredSteps });
}

export function rollupSessions(
  sessions: Array<{
    discipline: Discipline;
    targetZones: unknown;
    durationMinutes?: number | null;
    structuredSteps?: unknown;
  }>
): { zones: ZoneMinutes; missingZoneCount: number } {
  const zones: ZoneMinutes = {};
  let missingZoneCount = 0;

  for (const session of sessions) {
    const rollup = sessionPlannedZoneRollup(session.discipline, {
      targetZones: session.targetZones,
      structuredSteps: session.structuredSteps,
      durationHintMinutes: session.durationMinutes,
    });
    if (rollup.zoneAllocationMissing) missingZoneCount += 1;
    for (const [key, minutes] of Object.entries(rollup.zones)) {
      zones[key] = (zones[key] ?? 0) + minutes;
    }
  }

  return { zones, missingZoneCount };
}

export function buildGapRows(
  targets: ZoneMinutes,
  actual: ZoneMinutes
): Array<{ discipline: Discipline; zone: number; gap: number }> {
  const rows: Array<{ discipline: Discipline; zone: number; gap: number }> = [];
  const disciplines: Discipline[] = ["BIKE", "RUN", "SWIM"];
  for (const discipline of disciplines) {
    for (const zone of ZONES) {
      const key = zoneKey(discipline, zone);
      const target = targets[key] ?? 0;
      const act = actual[key] ?? 0;
      if (target > 0 || act > 0) {
        rows.push({ discipline, zone, gap: act - target });
      }
    }
  }
  return rows;
}
