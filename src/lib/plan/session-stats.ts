import type { Discipline } from "@prisma/client";
import type { SummaryStat } from "@/lib/activity/summary";
import { computeActivitySummary, resolveActivityNumericMetrics } from "@/lib/activity/summary";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  formatSessionDistance,
  formatSessionPace,
  formatSessionSpeed,
  resolveSessionMetrics,
  type SessionMetrics,
} from "@/lib/workout/metrics";
import {
  derivePlannedMetricsFromPlanningSteps,
  type DerivePlannedMetricsOptions,
} from "@/lib/workout/planned-metrics-from-steps";
import { flattenForPlanning, parseWorkoutTree } from "@/lib/workout/workout-tree";
import {
  formatZoneMinutes,
  totalZoneMinutes,
  zoneKey,
  type WorkoutStep,
  type ZoneMinutes,
} from "@/lib/workout/steps";

const STAT_LABEL_ORDER = [
  "Duration",
  "Elapsed",
  "Moving",
  "Distance",
  "Avg speed",
  "Avg pace",
  "Avg power",
  "Avg cadence",
  "Rest",
  "Avg heart rate",
  "Zone time",
] as const;

export type SessionStatRow = {
  label: string;
  planned: string | null;
  completed: string | null;
};

export type CompletedSessionSnapshot = {
  stats: SummaryStat[];
  zoneMinutes: ZoneMinutes;
  activities: Array<{ id: string; name: string }>;
  canonical?: PlannedMetricsTriadValues;
};

export function formatPlannedDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.round(minutes)}m`;
}

export function buildPlannedSessionStats(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  sessionMetrics: SessionMetrics,
  options?: DerivePlannedMetricsOptions & {
    targetZones?: unknown;
    durationHintMinutes?: number | null;
    structuredSteps?: unknown;
    steps?: WorkoutStep[];
  }
): { stats: SummaryStat[]; zoneMinutes: ZoneMinutes } {
  const {
    targetZones,
    durationHintMinutes,
    structuredSteps,
    steps = [],
    ...paceOptions
  } = options ?? {};
  const structured =
    structuredSteps != null ? parseWorkoutTree(structuredSteps) : null;
  const fromPlanning =
    structured && (discipline === "RUN" || discipline === "SWIM")
      ? derivePlannedMetricsFromPlanningSteps(
          discipline,
          flattenForPlanning(structured.nodes),
          paceOptions
        )
      : null;

  const metrics = fromPlanning
    ? {
        distanceMeters: sessionMetrics.distanceMeters ?? fromPlanning.distanceMeters,
        targetSpeedMps: sessionMetrics.targetSpeedMps ?? fromPlanning.targetSpeedMps,
        targetPaceSeconds: sessionMetrics.targetPaceSeconds ?? fromPlanning.targetPaceSeconds,
      }
    : resolveSessionMetrics(sessionMetrics, steps, discipline, paceOptions);

  const rollup = sessionPlannedZoneRollup(discipline, {
    targetZones,
    structuredSteps: structuredSteps ?? steps,
    durationHintMinutes,
  });
  const stats: SummaryStat[] = [];

  if (rollup.durationMinutes > 0) {
    stats.push({
      label: "Duration",
      value: formatPlannedDuration(rollup.durationMinutes),
    });
  }

  const distance = formatSessionDistance(metrics.distanceMeters, discipline, displayUnit);
  if (distance) {
    stats.push({ label: "Distance", value: distance });
  }

  if (discipline === "BIKE") {
    const speed = formatSessionSpeed(metrics.targetSpeedMps, displayUnit);
    if (speed) stats.push({ label: "Avg speed", value: speed });
  } else {
    const pace = formatSessionPace(
      metrics.targetPaceSeconds,
      discipline as "RUN" | "SWIM",
      displayUnit
    );
    if (pace) stats.push({ label: "Avg pace", value: pace });
  }

  if (rollup.totalMinutes > 0) {
    stats.push({
      label: "Zone time",
      value: formatZoneMinutes(rollup.totalMinutes),
    });
  }

  return { stats, zoneMinutes: rollup.zones };
}

type CompletedActivityInput = {
  id: string;
  name: string;
  durationSeconds: number;
  distanceMeters: number | null;
  rawStreams: unknown;
  zoneBreakdowns: Array<{ zone: number; minutes: number; isCanonical: boolean }>;
};

const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

function buildCompletedCanonicalMetrics(
  activities: CompletedActivityInput[],
  discipline: Discipline
): PlannedMetricsTriadValues | undefined {
  if (activities.length !== 1) return undefined;
  const activity = activities[0];
  const { elapsedSeconds, movingSeconds, distanceMeters } = resolveActivityNumericMetrics(
    activity.durationSeconds,
    activity.distanceMeters,
    parseStoredStreams(activity.rawStreams)
  );
  const durationSeconds =
    discipline === "SWIM" ? elapsedSeconds : (movingSeconds ?? elapsedSeconds);
  if (durationSeconds <= 0) return undefined;

  const durationMinutes = durationSeconds / 60;
  let targetSpeedMps: number | null = null;
  let targetPaceSeconds: number | null = null;

  if (distanceMeters != null && distanceMeters > 0) {
    if (discipline === "BIKE") {
      targetSpeedMps = distanceMeters / durationSeconds;
    } else if (discipline === "RUN") {
      targetPaceSeconds = durationSeconds / (distanceMeters / METERS_PER_KM);
    } else if (discipline === "SWIM") {
      targetPaceSeconds = durationSeconds / (distanceMeters / METERS_PER_100M);
    }
  }

  return {
    durationMinutes,
    distanceMeters: distanceMeters ?? null,
    targetSpeedMps,
    targetPaceSeconds,
  };
}

export function buildCompletedSessionStats(
  activities: CompletedActivityInput[],
  discipline: Discipline,
  displayUnit: DisplayUnit
): CompletedSessionSnapshot {
  if (activities.length === 0) {
    return { stats: [], zoneMinutes: {}, activities: [] };
  }

  const zoneMinutes: ZoneMinutes = {};
  for (const activity of activities) {
    for (const zb of activity.zoneBreakdowns) {
      if (!zb.isCanonical) continue;
      const key = zoneKey(discipline, zb.zone);
      zoneMinutes[key] = (zoneMinutes[key] ?? 0) + zb.minutes;
    }
  }

  const stats =
    activities.length === 1
      ? computeActivitySummary({
          discipline,
          durationSeconds: activities[0].durationSeconds,
          distanceMeters: activities[0].distanceMeters,
          streams: parseStoredStreams(activities[0].rawStreams),
          displayUnit,
        })
      : mergeActivitySummaries(activities, discipline, displayUnit);

  const zoneTotal = totalZoneMinutes(zoneMinutes);
  if (zoneTotal > 0 && !stats.some((s) => s.label === "Zone time")) {
    stats.push({ label: "Zone time", value: formatZoneMinutes(zoneTotal) });
  }

  return {
    stats,
    zoneMinutes,
    activities: activities.map((a) => ({ id: a.id, name: a.name })),
    canonical: buildCompletedCanonicalMetrics(activities, discipline),
  };
}

function mergeActivitySummaries(
  activities: CompletedActivityInput[],
  discipline: Discipline,
  displayUnit: DisplayUnit
): SummaryStat[] {
  const perActivity = activities.map((activity) =>
    computeActivitySummary({
      discipline,
      durationSeconds: activity.durationSeconds,
      distanceMeters: activity.distanceMeters,
      streams: parseStoredStreams(activity.rawStreams),
      displayUnit,
    })
  );

  const labelSet = new Set<string>();
  for (const list of perActivity) {
    for (const stat of list) labelSet.add(stat.label);
  }

  const stats: SummaryStat[] = [];
  for (const label of STAT_LABEL_ORDER) {
    if (!labelSet.has(label)) continue;
    const values = perActivity
      .map((list) => list.find((s) => s.label === label)?.value)
      .filter((v): v is string => Boolean(v));
    if (values.length === 0) continue;
    const unique = [...new Set(values)];
    stats.push({
      label,
      value: unique.length === 1 ? unique[0] : values.join(" + "),
    });
  }

  for (const label of labelSet) {
    if (STAT_LABEL_ORDER.includes(label as (typeof STAT_LABEL_ORDER)[number])) continue;
    const values = perActivity
      .map((list) => list.find((s) => s.label === label)?.value)
      .filter((v): v is string => Boolean(v));
    if (values.length > 0) {
      stats.push({ label, value: values.join(" + ") });
    }
  }

  return stats;
}

export function mergeSessionStatRows(
  planned: SummaryStat[],
  completed: SummaryStat[]
): SessionStatRow[] {
  const plannedMap = new Map(planned.map((s) => [s.label, s.value]));
  const completedMap = new Map(completed.map((s) => [s.label, s.value]));
  const allLabels = new Set([...plannedMap.keys(), ...completedMap.keys()]);

  const ordered: string[] = [];
  for (const label of STAT_LABEL_ORDER) {
    if (allLabels.has(label)) ordered.push(label);
  }
  for (const label of allLabels) {
    if (!ordered.includes(label)) ordered.push(label);
  }

  return ordered
    .map((label) => ({
      label,
      planned: plannedMap.get(label) ?? null,
      completed: completedMap.get(label) ?? null,
    }))
    .filter((row) => row.planned !== null || row.completed !== null);
}

export function disciplineZoneMinutes(
  zones: ZoneMinutes,
  discipline: Discipline
): ZoneMinutes {
  const result: ZoneMinutes = {};
  for (const zone of [1, 2, 3, 4, 5] as const) {
    const key = zoneKey(discipline, zone);
    const minutes = zones[key];
    if (minutes && minutes > 0) result[key] = minutes;
  }
  return result;
}

/** Completed duration for planned-vs-completed: swim = elapsed, bike/run = moving. */
export function completedComparisonDuration(
  stats: SummaryStat[],
  discipline: PlanDiscipline
): string | null {
  if (discipline === "SWIM") {
    return (
      stats.find((s) => s.label === "Elapsed")?.value ??
      stats.find((s) => s.label === "Duration")?.value ??
      null
    );
  }
  return (
    stats.find((s) => s.label === "Moving")?.value ??
    stats.find((s) => s.label === "Duration")?.value ??
    null
  );
}

function completedDurationSourceLabel(
  stats: SummaryStat[],
  discipline: PlanDiscipline
): string | null {
  if (discipline === "SWIM") {
    if (stats.some((s) => s.label === "Elapsed")) return "Elapsed";
    if (stats.some((s) => s.label === "Duration")) return "Duration";
    return null;
  }
  if (stats.some((s) => s.label === "Moving")) return "Moving";
  if (stats.some((s) => s.label === "Duration")) return "Duration";
  return null;
}

/** Completed-only summary stats shown below the planned vs completed comparison. */
export function extraCompletedSummaryStats(
  stats: SummaryStat[],
  discipline: PlanDiscipline
): SummaryStat[] {
  const paceLabel = discipline === "BIKE" ? "Avg speed" : "Avg pace";
  const durationLabel = completedDurationSourceLabel(stats, discipline);

  return stats.filter((s) => {
    if (s.label === "Distance" || s.label === paceLabel) return false;
    if (durationLabel && s.label === durationLabel) return false;
    return true;
  });
}
