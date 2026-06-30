import type { Discipline } from "@prisma/client";
import {
  isChartDiscipline,
  parseRecordStreamPoints,
  recordStreamMetrics,
  type ActivityStreamPoint,
  type ChartDiscipline,
  type StreamMetrics,
} from "@/lib/activity/record-streams";
import {
  buildWorkoutAnalysisOverlay,
  type WorkoutAnalysisOverlay,
} from "@/lib/activity/workout-analysis-overlay";
import { db } from "@/lib/db";
import { defaultPrimarySignalForDiscipline } from "@/lib/workout/workout-profile";
import type { WorkoutExecutionLap } from "@/lib/zones/compute";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { getSignalPreferenceAtDate } from "@/lib/zones/signal-preference";
import { getThresholdProfileAtDate } from "@/lib/zones/thresholds";

export type ActivityStreamChartData = {
  points: ActivityStreamPoint[];
  metrics: StreamMetrics;
  discipline: ChartDiscipline;
  displayUnit: "METRIC" | "IMPERIAL";
  overlay: WorkoutAnalysisOverlay | null;
  chartTitle: string;
};

function workoutLapsFromStreams(streams: ReturnType<typeof parseStoredStreams>) {
  const wl = streams.workoutLaps;
  return (Array.isArray(wl) ? wl : wl?.data) as WorkoutExecutionLap[] | undefined;
}

export async function resolveActivityStreamChart(input: {
  athleteId: string;
  discipline: Discipline;
  displayUnit: "METRIC" | "IMPERIAL";
  rawStreams: unknown;
  durationSeconds: number | null;
  activityStartTime: Date;
  structuredSteps?: unknown;
}): Promise<ActivityStreamChartData | null> {
  const chartDiscipline = isChartDiscipline(input.discipline)
    ? input.discipline
    : null;
  if (!chartDiscipline) return null;

  const streams = parseStoredStreams(input.rawStreams);
  const points = parseRecordStreamPoints(
    streams,
    input.displayUnit,
    chartDiscipline,
    input.durationSeconds ?? undefined
  );
  if (!points) return null;

  const metrics = recordStreamMetrics(points, chartDiscipline);
  if (!metrics) return null;

  let overlay: WorkoutAnalysisOverlay | null = null;
  const workoutLaps = workoutLapsFromStreams(streams);

  if (input.structuredSteps && workoutLaps?.length) {
    const settingsRow = await db.athleteDisciplineSettings.findFirst({
      where: { athleteId: input.athleteId, discipline: input.discipline },
    });
    const preference = await getSignalPreferenceAtDate(
      input.athleteId,
      input.discipline,
      input.activityStartTime
    );
    const primarySignal =
      preference?.primarySignal ??
      settingsRow?.primarySignal ??
      defaultPrimarySignalForDiscipline(input.discipline);

    const powerProfile =
      chartDiscipline === "BIKE"
        ? await getThresholdProfileAtDate(
            input.athleteId,
            input.discipline,
            "POWER",
            input.activityStartTime
          )
        : null;
    const paceProfile =
      chartDiscipline === "RUN"
        ? await getThresholdProfileAtDate(
            input.athleteId,
            input.discipline,
            "PACE",
            input.activityStartTime
          )
        : null;
    const hrProfile = await getThresholdProfileAtDate(
      input.athleteId,
      input.discipline,
      "HEART_RATE",
      input.activityStartTime
    );

    overlay = buildWorkoutAnalysisOverlay({
      structuredSteps: input.structuredSteps,
      workoutLaps,
      discipline: chartDiscipline,
      displayUnit: input.displayUnit,
      primarySignal,
      thresholds: {
        thresholdFtpWatts: powerProfile?.thresholdValue ?? null,
        thresholdPaceSeconds: paceProfile?.thresholdValue ?? null,
        thresholdHrBpm: hrProfile?.thresholdValue ?? null,
      },
      streamPoints: points,
    });
  }

  return {
    points,
    metrics,
    discipline: chartDiscipline,
    displayUnit: input.displayUnit,
    overlay,
    chartTitle: overlay ? "Workout analysis" : "Activity",
  };
}
