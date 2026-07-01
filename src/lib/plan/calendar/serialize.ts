import type { Discipline, DisplayUnit, PlannedSession, PoolSize, SignalType, SyncedActivity } from "@prisma/client";
import { format } from "date-fns";
import { resolveActivityNumericMetrics } from "@/lib/activity/summary";
import { calendarDateFromDb } from "@/lib/dates";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import { hasSessionCompletionOverride } from "@/lib/plan/session-completion";
import {
  resolveSessionPoolSize,
  swimDisplayUnit,
  type PoolSize as PoolSizeSetting,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import {
  formatSessionMetricsSummary,
  resolveSessionMetrics,
} from "@/lib/workout/metrics";
import { parseWorkoutSteps, type ZoneMinutes } from "@/lib/workout/steps";
import { parseWorkoutTree } from "@/lib/workout/workout-tree";
import {
  buildWorkoutProfile,
  defaultPrimarySignalForDiscipline,
} from "@/lib/workout/workout-profile";

export type CalendarWorkoutProfile = {
  segments: Array<{
    x: number;
    width: number;
    yLow: number;
    yHigh: number;
    fill: string;
  }>;
  totalX: number;
  yMin: number;
  yMax: number;
};

export type CalendarLinkedActivity = {
  id: string;
  name: string;
  startTime: string;
  durationSeconds: number;
  elapsedSeconds: number;
  movingSeconds: number | null;
  distanceMeters: number | null;
  zoneMinutes: number;
  discipline: string;
  legType: string | null;
};

export type CalendarPlannedSession = {
  id: string;
  scheduledDate: string;
  discipline: string;
  title: string;
  totalMinutes: number;
  plannedMinutes: number;
  distanceMeters: number | null;
  zoneMinutes: ZoneMinutes;
  stepCount: number;
  metricsSummary: string | null;
  zoneAllocationMissing: boolean;
  source: "FLEXIBLE" | "ANCHORED_INSTANCE" | "TEMPLATE" | "RACE";
  poolSize: PoolSize | null;
  multisportGroupId: string | null;
  sessionIndex: number | null;
  estimatedDurationMinutes: number | null;
  linkedActivity: CalendarLinkedActivity | null;
  hasCompletedOverride: boolean;
  completedDurationMinutes: number | null;
  completedDistanceMeters: number | null;
  completedTargetSpeedMps: number | null;
  completedTargetPaceSeconds: number | null;
  completedZones: unknown;
  workoutProfile: CalendarWorkoutProfile | null;
};

type SessionRow = PlannedSession & {
  structuredWorkout: { steps: unknown } | null;
  linkedActivity?: (Pick<
    SyncedActivity,
    "id" | "name" | "startTime" | "durationSeconds" | "distanceMeters" | "rawStreams" | "discipline" | "legType"
  > & {
    zoneBreakdowns: Array<{ zone: number; minutes: number; isCanonical: boolean }>;
  }) | null;
};

function parseStoredStreams(raw: unknown): NormalizedStreams {
  if (!raw || typeof raw !== "object") return {};
  return raw as NormalizedStreams;
}

function serializeLinkedActivity(
  activity: SessionRow["linkedActivity"]
): CalendarLinkedActivity | null {
  if (!activity) return null;

  const streams = parseStoredStreams(activity.rawStreams);
  const { elapsedSeconds, movingSeconds, distanceMeters } = resolveActivityNumericMetrics(
    activity.durationSeconds,
    activity.distanceMeters,
    streams
  );

  let zoneMinutes = 0;
  for (const zb of activity.zoneBreakdowns) {
    if (zb.isCanonical) zoneMinutes += zb.minutes;
  }

  return {
    id: activity.id,
    name: activity.name,
    startTime: activity.startTime.toISOString(),
    durationSeconds: activity.durationSeconds,
    elapsedSeconds,
    movingSeconds,
    distanceMeters,
    zoneMinutes,
    discipline: activity.discipline,
    legType: activity.legType,
  };
}

function buildSessionWorkoutProfile(
  structuredSteps: unknown | null | undefined,
  discipline: Discipline,
  displayUnit: DisplayUnit,
  primarySignals: Partial<Record<Discipline, SignalType>>
): CalendarWorkoutProfile | null {
  if (!structuredSteps) return null;
  const tree = parseWorkoutTree(structuredSteps);
  if (tree.nodes.length === 0) return null;

  const primarySignal =
    primarySignals[discipline] ?? defaultPrimarySignalForDiscipline(discipline);
  const profile = buildWorkoutProfile(tree.nodes, {
    primarySignal,
    lengthView: "duration",
    discipline,
    displayUnit,
  });
  if (profile.segments.length === 0) return null;

  return {
    segments: profile.segments.map((seg) => ({
      x: seg.x,
      width: seg.width,
      yLow: seg.yLow,
      yHigh: seg.yHigh,
      fill: seg.fill,
    })),
    totalX: profile.totalX,
    yMin: profile.yMin,
    yMax: profile.yMax,
  };
}

export function serializePlannedSessions(
  sessions: SessionRow[],
  displayUnits: Partial<Record<Discipline, DisplayUnit>>,
  defaultPoolSizes: Partial<Record<PlanDiscipline, PoolSizeSetting | null>> = {},
  primarySignals: Partial<Record<Discipline, SignalType>> = {}
): CalendarPlannedSession[] {
  return sessions.map((s) => {
    const steps = s.structuredWorkout ? parseWorkoutSteps(s.structuredWorkout.steps) : [];
    const structuredRaw = s.structuredWorkout?.steps;
    const rollup = sessionPlannedZoneRollup(s.discipline, {
      targetZones: s.targetZones,
      structuredSteps: structuredRaw,
    });
    const raceMinutes = s.estimatedDurationMinutes ?? 0;
    const resolvedPlannedMinutes =
      raceMinutes > 0
        ? raceMinutes
        : rollup.durationMinutes > 0
          ? rollup.durationMinutes
          : rollup.totalMinutes;
    const metrics = resolveSessionMetrics(
      {
        distanceMeters: s.distanceMeters,
        targetSpeedMps: s.targetSpeedMps,
        targetPaceSeconds: s.targetPaceSeconds,
      },
      steps,
      s.discipline as PlanDiscipline,
      structuredRaw ? { structuredSteps: structuredRaw } : undefined
    );
    const poolSize =
      s.discipline === "SWIM"
        ? (resolveSessionPoolSize(s.discipline, s.poolSize, defaultPoolSizes.SWIM) as PoolSize)
        : null;
    const unit =
      s.discipline === "SWIM"
        ? swimDisplayUnit(poolSize)
        : (displayUnits[s.discipline] ?? "METRIC");
    const workoutProfile =
      s.discipline === "STRENGTH"
        ? null
        : buildSessionWorkoutProfile(
            structuredRaw,
            s.discipline,
            unit,
            primarySignals
          );
    return {
      id: s.id,
      scheduledDate: format(calendarDateFromDb(s.scheduledDate), "yyyy-MM-dd"),
      discipline: s.discipline,
      title: s.title,
      totalMinutes: resolvedPlannedMinutes,
      plannedMinutes: resolvedPlannedMinutes,
      distanceMeters: metrics.distanceMeters,
      zoneMinutes: rollup.zones,
      stepCount: steps.length,
      metricsSummary: formatSessionMetricsSummary(metrics, s.discipline, unit),
      zoneAllocationMissing: s.zoneAllocationMissing || rollup.zoneAllocationMissing,
      source: s.source,
      poolSize,
      multisportGroupId: s.multisportGroupId ?? null,
      sessionIndex: s.sessionIndex ?? null,
      estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
      linkedActivity: serializeLinkedActivity(s.linkedActivity),
      hasCompletedOverride: hasSessionCompletionOverride(s),
      completedDurationMinutes: s.completedDurationMinutes ?? null,
      completedDistanceMeters: s.completedDistanceMeters ?? null,
      completedTargetSpeedMps: s.completedTargetSpeedMps ?? null,
      completedTargetPaceSeconds: s.completedTargetPaceSeconds ?? null,
      completedZones: s.completedZones ?? null,
      workoutProfile,
    };
  });
}

export { parseDateKey } from "@/lib/dates";
