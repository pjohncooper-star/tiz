import type { Discipline, DisplayUnit, PlannedSession, PoolSize, PoolSlotKind, SessionRole, SignalType, SyncedActivity } from "@prisma/client";
import { format } from "date-fns";
import { resolveActivityNumericMetrics } from "@/lib/activity/summary";
import { calendarDateFromDb } from "@/lib/dates";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import type { PaceThresholdContext } from "@/lib/plan/pace-threshold-context";
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
import { inferSignalFromWorkoutNodes } from "@/lib/workout/infer-prescription-signal";
import {
  buildWorkoutProfile,
  defaultPrimarySignalForDiscipline,
} from "@/lib/workout/workout-profile";
import { resolveDisplaySessionRole } from "@/lib/plan/session-role";
import {
  parseRoleSignals,
  type SignalPreferenceSnapshot,
} from "@/lib/zones/signal-preference";

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
  source: "FLEXIBLE" | "TEMPLATE" | "RACE";
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
  sessionRole: SessionRole;
  displaySessionRole: SessionRole;
  tizSignalOverride: SignalType | null;
  poolSlotKind: PoolSlotKind | null;
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
  displayUnit: DisplayUnit
): CalendarWorkoutProfile | null {
  if (!structuredSteps) return null;
  const tree = parseWorkoutTree(structuredSteps);
  if (tree.nodes.length === 0) return null;

  // Profile shape follows how the workout was prescribed (same as TiZ scoring),
  // not athlete TiZ prefs — avoids collapsing watt intervals onto an HR axis.
  const primarySignal =
    inferSignalFromWorkoutNodes(tree.nodes, discipline) ??
    defaultPrimarySignalForDiscipline(discipline);
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

/** Build per-discipline signal snapshots from settings rows (primary + role overrides). */
export function signalPrefsFromDisciplineSettings(
  rows: Array<{
    discipline: Discipline;
    primarySignal: SignalType;
    fallbackSignal?: SignalType | null;
    roleSignals?: unknown;
  }>
): Partial<Record<Discipline, SignalPreferenceSnapshot>> {
  const prefs: Partial<Record<Discipline, SignalPreferenceSnapshot>> = {};
  for (const row of rows) {
    prefs[row.discipline] = {
      primarySignal: row.primarySignal,
      fallbackSignal: row.fallbackSignal ?? null,
      roleSignals: parseRoleSignals(row.roleSignals),
    };
  }
  return prefs;
}

export function serializePlannedSessions(
  sessions: SessionRow[],
  displayUnits: Partial<Record<Discipline, DisplayUnit>>,
  defaultPoolSizes: Partial<Record<PlanDiscipline, PoolSizeSetting | null>> = {},
  /**
   * Per-discipline TiZ signal prefs (primary + optional role overrides).
   * Accepted for call-site compatibility; calendar workout profiles follow
   * structured prescription targets (see buildSessionWorkoutProfile).
   * Also accepts a legacy flat `Partial<Record<Discipline, SignalType>>` map.
   */
  signalPrefs:
    | Partial<Record<Discipline, SignalPreferenceSnapshot>>
    | Partial<Record<Discipline, SignalType>> = {},
  paceContext: PaceThresholdContext | null = null
): CalendarPlannedSession[] {
  void signalPrefs;
  return sessions.map((s) => {
    const steps = s.structuredWorkout ? parseWorkoutSteps(s.structuredWorkout.steps) : [];
    const structuredRaw = s.structuredWorkout?.steps;
    const rollup = sessionPlannedZoneRollup(s.discipline, {
      targetZones: s.targetZones,
      structuredSteps: structuredRaw,
      paceContext,
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
    const sessionOverride =
      "tizSignalOverride" in s
        ? ((s as { tizSignalOverride?: SignalType | null }).tizSignalOverride ?? null)
        : null;
    const workoutProfile =
      s.discipline === "STRENGTH"
        ? null
        : buildSessionWorkoutProfile(structuredRaw, s.discipline, unit);
    const displaySessionRole = resolveDisplaySessionRole({
      sessionRole: s.sessionRole,
      title: s.title,
      discipline: s.discipline,
      durationMinutes: resolvedPlannedMinutes,
      zoneMinutes: rollup.zones,
    });
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
      sessionRole: s.sessionRole,
      displaySessionRole,
      tizSignalOverride: sessionOverride,
      poolSlotKind: s.poolSlotKind ?? null,
    };
  });
}

export { parseDateKey } from "@/lib/dates";
