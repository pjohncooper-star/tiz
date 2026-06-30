import type { Discipline, SignalType } from "@prisma/client";
import {
  distanceXValue,
  type ActivityStreamPoint,
} from "@/lib/activity/record-streams";
import { buildStepExecutionRows } from "@/lib/plan/workout-execution";
import { parseWorkoutTree } from "@/lib/workout/workout-tree";
import {
  collectExecutionProfileBands,
  type WorkoutProfileThresholds,
} from "@/lib/workout/workout-profile";
import type { WorkoutExecutionLap } from "@/lib/zones/compute";

export type LapRegion = {
  index: number;
  startSec: number;
  endSec: number;
  startDistanceM: number;
  endDistanceM: number;
  label?: string;
  groupLabel?: string;
};

export type ActualStepRegion = {
  index: number;
  startTimeSec: number;
  endTimeSec: number;
  startDistanceM: number;
  endDistanceM: number;
  label: string;
  groupLabel?: string;
  yLow: number;
  yHigh: number;
  fill: string;
  openDuration: boolean;
};

export type GhostPoint = {
  xTime: number;
  xDistance: number;
  y: number;
};

export type WorkoutAnalysisOverlay = {
  lapRegions: LapRegion[];
  stepRegions: ActualStepRegion[];
  ghostPoints: GhostPoint[];
  ghostYAxisId: "power" | "pace" | "heartRate";
};

function normalizeLaps(laps: WorkoutExecutionLap[]): WorkoutExecutionLap[] {
  return laps
    .map((lap) => {
      const elapsedSeconds = Number(lap.elapsedSeconds);
      const wktStepIndex =
        lap.wktStepIndex != null ? Number(lap.wktStepIndex) : undefined;
      return {
        ...lap,
        elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
        ...(Number.isInteger(wktStepIndex) ? { wktStepIndex } : {}),
      };
    })
    .filter((lap) => lap.elapsedSeconds > 0);
}

/** Interpolate distance (meters) at elapsed time from stream samples. */
export function distanceAtTime(
  points: ActivityStreamPoint[],
  timeSec: number
): number {
  if (points.length === 0) return 0;
  if (timeSec <= points[0].timeSec) return points[0].distanceM;
  const last = points[points.length - 1];
  if (timeSec >= last.timeSec) return last.distanceM;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].timeSec <= timeSec) lo = mid;
    else hi = mid;
  }

  const a = points[lo];
  const b = points[hi];
  const dt = b.timeSec - a.timeSec;
  if (dt <= 0) return a.distanceM;
  const t = (timeSec - a.timeSec) / dt;
  return a.distanceM + t * (b.distanceM - a.distanceM);
}

function profileYToChartValue(
  yLow: number,
  yHigh: number,
  ghostYAxisId: WorkoutAnalysisOverlay["ghostYAxisId"],
  discipline: Discipline
): number {
  const mid = (yLow + yHigh) / 2;
  if (ghostYAxisId === "pace" && (discipline === "RUN" || discipline === "SWIM")) {
    return Math.abs(mid);
  }
  return mid;
}

function ghostYAxisForSignal(
  primarySignal: SignalType,
  discipline: Discipline
): WorkoutAnalysisOverlay["ghostYAxisId"] {
  if (primarySignal === "HEART_RATE") return "heartRate";
  if (primarySignal === "PACE" && (discipline === "RUN" || discipline === "SWIM")) {
    return "pace";
  }
  return "power";
}

export function buildWorkoutAnalysisOverlay(input: {
  structuredSteps: unknown;
  workoutLaps: WorkoutExecutionLap[];
  discipline: Discipline;
  displayUnit: "METRIC" | "IMPERIAL";
  primarySignal: SignalType;
  thresholds?: WorkoutProfileThresholds;
  streamPoints: ActivityStreamPoint[];
}): WorkoutAnalysisOverlay | null {
  const {
    structuredSteps,
    workoutLaps,
    discipline,
    displayUnit,
    primarySignal,
    thresholds = {},
    streamPoints,
  } = input;

  const laps = normalizeLaps(workoutLaps);
  if (laps.length === 0) return null;

  const tree = parseWorkoutTree(structuredSteps);
  if (tree.nodes.length === 0) return null;

  const executionRows = buildStepExecutionRows(structuredSteps, laps, discipline);
  const profileBands = collectExecutionProfileBands(
    tree.nodes,
    discipline,
    primarySignal,
    thresholds
  );

  if (profileBands.length === 0) return null;

  const ghostYAxisId = ghostYAxisForSignal(primarySignal, discipline);

  const lapRegions: LapRegion[] = [];
  let lapTime = 0;
  for (let i = 0; i < laps.length; i++) {
    const endSec = lapTime + laps[i].elapsedSeconds;
    lapRegions.push({
      index: i,
      startSec: lapTime,
      endSec,
      startDistanceM: distanceAtTime(streamPoints, lapTime),
      endDistanceM: distanceAtTime(streamPoints, endSec),
    });
    lapTime = endSec;
  }

  const stepRegions: ActualStepRegion[] = [];
  const ghostPoints: GhostPoint[] = [];
  let timeCursor = 0;
  let distCursor = 0;

  for (let i = 0; i < profileBands.length; i++) {
    const band = profileBands[i];
    const row = executionRows?.[i];

    const timeWidth =
      band.openDuration && row?.actualSeconds != null
        ? row.actualSeconds
        : band.plannedSeconds > 0
          ? band.plannedSeconds
          : row?.actualSeconds ?? 0;

    const startTimeSec = timeCursor;
    const endTimeSec = timeCursor + timeWidth;

    let distWidth = band.plannedDistanceM;
    if (band.plannedDistanceM <= 0 && timeWidth > 0) {
      const endDist = distanceAtTime(streamPoints, endTimeSec);
      distWidth = Math.max(0, endDist - distCursor);
    }

    const startDistanceM = distCursor;
    const endDistanceM = distCursor + distWidth;

    const label = row?.label ?? band.label;
    const groupLabel = row?.groupLabel ?? band.groupLabel ?? undefined;

    stepRegions.push({
      index: i,
      startTimeSec,
      endTimeSec,
      startDistanceM,
      endDistanceM,
      label,
      groupLabel,
      yLow: band.yLow,
      yHigh: band.yHigh,
      fill: band.fill,
      openDuration: band.openDuration,
    });

    const ghostY = profileYToChartValue(
      band.yLow,
      band.yHigh,
      ghostYAxisId,
      discipline
    );
    ghostPoints.push({
      xTime: startTimeSec,
      xDistance: distanceXValue(startDistanceM, displayUnit),
      y: ghostY,
    });
    ghostPoints.push({
      xTime: endTimeSec,
      xDistance: distanceXValue(endDistanceM, displayUnit),
      y: ghostY,
    });

    timeCursor = endTimeSec;
    distCursor = endDistanceM;
  }

  for (const lap of lapRegions) {
    const mid = (lap.startSec + lap.endSec) / 2;
    const step = findStepRegionAtTime(stepRegions, mid);
    if (step) {
      lap.label = step.label;
      lap.groupLabel = step.groupLabel;
    }
  }

  if (stepRegions.length === 0) return null;

  return {
    lapRegions,
    stepRegions,
    ghostPoints,
    ghostYAxisId,
  };
}

export function findLapRegionAtTime(
  regions: LapRegion[],
  timeSec: number
): LapRegion | null {
  for (const region of regions) {
    if (timeSec >= region.startSec && timeSec < region.endSec) return region;
  }
  const last = regions[regions.length - 1];
  if (last && timeSec >= last.startSec && timeSec <= last.endSec) return last;
  return null;
}

export function findStepRegionAtTime(
  regions: ActualStepRegion[],
  timeSec: number
): ActualStepRegion | null {
  for (const region of regions) {
    if (timeSec >= region.startTimeSec && timeSec < region.endTimeSec) return region;
  }
  const last = regions[regions.length - 1];
  if (last && timeSec >= last.startTimeSec && timeSec <= last.endTimeSec) return last;
  return null;
}
