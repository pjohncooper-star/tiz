import { notFound } from "next/navigation";
import type {
  Discipline,
  DisplayUnit,
  SignalType,
  SurveyResponse,
  ThresholdProfile,
  ZoneBreakdown,
} from "@prisma/client";
import { computeActivitySummary, type SummaryStat } from "@/lib/activity/summary";
import { formatDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { titleMatchesSportDefault, type PlanDiscipline } from "@/lib/plan/session";
import { hasSessionCompletionOverride } from "@/lib/plan/session-completion";
import { getCompletedSessionSnapshot } from "@/lib/plan/session-stats.server";
import { resolveWorkoutReturnHref } from "@/lib/plan/workout-return";
import {
  buildDisciplineSettings,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import { parseWorkoutTree } from "@/lib/workout/steps";
import type { WorkoutTreeDocument } from "@/lib/workout/workout-tree";
import type { NormalizedStreams, WorkoutExecutionLap } from "@/lib/zones/compute";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { parseSelfEvalConfig, type SelfEvalConfig } from "@/lib/survey/self-eval-config";
import { parseSwimLapIntervals, type SwimLapInterval } from "@/lib/zones/swim-laps";
import { getSignalPreferenceAtDate, parseRoleSignals, resolvePrimarySignalForSession } from "@/lib/zones/signal-preference";
import { getThresholdProfileAtDate, parseZoneBoundaries } from "@/lib/zones/thresholds";
import type { CompletedSessionSnapshot } from "@/lib/plan/session-stats";
import { DEFAULT_DISCIPLINE_SIGNALS } from "@/lib/zones/defaults";

const ENDURANCE_DISCIPLINES = new Set<PlanDiscipline>(["BIKE", "RUN", "SWIM"]);

export type WorkoutDetailMode = "planned" | "completed" | "planned_and_completed";

export type WorkoutDetailLinkedActivity = {
  id: string;
  discipline: Discipline;
  rawStreams: unknown;
  durationSeconds: number;
  startTime: Date;
  ecos: number | null;
  ecoComputed: boolean;
  surveyResponse: SurveyResponse | null;
  zoneBreakdowns: (ZoneBreakdown & { thresholdProfile: ThresholdProfile | null })[];
};

export type WorkoutDetailViewModel = {
  mode: WorkoutDetailMode;
  athleteId: string;
  returnHref: string;
  scheduledDateKey: string;
  sessionId: string;
  discipline: Discipline;
  title: string;
  notes: string;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: import("@/lib/units/discipline-settings").PoolSize | null;
  targetZones: unknown;
  hasStructuredWorkout: boolean;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  displayUnit: DisplayUnit;
  completed: CompletedSessionSnapshot;
  activityCompleted: CompletedSessionSnapshot | null;
  linkedActivityId: string | null;
  hasCompletedOverride: boolean;
  initialCompletedZones: unknown;
  workoutTree: WorkoutTreeDocument | undefined;
  structuredSteps: unknown;
  thresholdPaceSeconds: number | null;
  thresholdZoneBoundaries: number[] | undefined;
  primarySignal: SignalType | null;
  sessionSource: "FLEXIBLE" | "TEMPLATE" | "RACE";
  workoutSource: {
    folder: { id: string; name: string; folderKind: string } | null;
    workoutTemplate: { id: string; name: string; sortOrder: number | null };
  } | null;
  selfEvalConfig: SelfEvalConfig;
  ecoLoadEnabled: boolean;
  linkedActivity: WorkoutDetailLinkedActivity | null;
  workoutLaps: WorkoutExecutionLap[] | undefined;
  swimLaps: SwimLapInterval[] | null;
  showExecutionChart: boolean;
  isEndurance: boolean;
  summaryStats: SummaryStat[];
};

export function detectWorkoutDetailMode(input: {
  hasCompleted: boolean;
  hasStructuredWorkout: boolean;
  hasPlannedMetrics: boolean;
  hasNotes: boolean;
  isDefaultTitle: boolean;
  source: "FLEXIBLE" | "TEMPLATE" | "RACE";
}): WorkoutDetailMode {
  const hasPlannedContent =
    input.hasStructuredWorkout ||
    input.hasPlannedMetrics ||
    input.hasNotes ||
    !input.isDefaultTitle ||
    input.source !== "FLEXIBLE";

  if (input.hasCompleted && hasPlannedContent) return "planned_and_completed";
  if (input.hasCompleted) return "completed";
  return "planned";
}

export async function loadWorkoutDetail(
  athleteId: string,
  sessionId: string,
  returnTo?: string | null
): Promise<WorkoutDetailViewModel> {
  const returnHref = resolveWorkoutReturnHref(returnTo);

  const [plannedSession, athlete] = await Promise.all([
    db.plannedSession.findFirst({
      where: { id: sessionId, athleteId },
      include: {
        structuredWorkout: true,
        workoutSource: {
          include: {
            folder: { select: { id: true, name: true, folderKind: true } },
            workoutTemplate: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    }),
    db.athlete.findUnique({
      where: { id: athleteId },
      select: { selfEvalConfig: true, ecoLoadEnabled: true },
    }),
  ]);

  if (!plannedSession) notFound();

  const selfEvalConfig = parseSelfEvalConfig(athlete?.selfEvalConfig);
  const ecoLoadEnabled = Boolean(
    athlete && "ecoLoadEnabled" in athlete ? athlete.ecoLoadEnabled : false
  );

  const disciplineSettingsRows = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
  });

  const disciplineSettings = buildDisciplineSettings(
    disciplineSettingsRows.map((s) => ({
      discipline: s.discipline,
      displayUnit: s.displayUnit,
      poolSize: s.poolSize,
    }))
  );

  const displayUnit = unitSettingsForDiscipline(
    plannedSession.discipline,
    disciplineSettings
  ).displayUnit;

  const completed = await getCompletedSessionSnapshot(
    athleteId,
    plannedSession.scheduledDate,
    plannedSession.discipline,
    displayUnit,
    {
      plannedSessionId: plannedSession.id,
      linkedActivityId: plannedSession.linkedActivityId,
    }
  );

  const activityCompleted = plannedSession.linkedActivityId
    ? await getCompletedSessionSnapshot(
        athleteId,
        plannedSession.scheduledDate,
        plannedSession.discipline,
        displayUnit,
        { linkedActivityId: plannedSession.linkedActivityId }
      )
    : null;

  const hasCompletedOverride = hasSessionCompletionOverride(plannedSession);

  const settingsRow = disciplineSettingsRows.find(
    (s) => s.discipline === plannedSession.discipline
  );

  const preference = await getSignalPreferenceAtDate(
    athleteId,
    plannedSession.discipline,
    plannedSession.scheduledDate
  );
  const snapshot = preference ?? {
    primarySignal:
      settingsRow?.primarySignal ??
      DEFAULT_DISCIPLINE_SIGNALS[plannedSession.discipline].primary,
    fallbackSignal:
      settingsRow?.fallbackSignal ??
      DEFAULT_DISCIPLINE_SIGNALS[plannedSession.discipline].fallback,
    roleSignals: parseRoleSignals(
      settingsRow && "roleSignals" in settingsRow ? settingsRow.roleSignals : null
    ),
  };
  const primarySignal = resolvePrimarySignalForSession(
    plannedSession.discipline,
    snapshot,
    plannedSession.sessionRole
  );

  let thresholdPaceSeconds: number | null = null;
  let thresholdZoneBoundaries: number[] | undefined;

  if (plannedSession.discipline === "RUN" || plannedSession.discipline === "SWIM") {
    const paceProfile = await getThresholdProfileAtDate(
      athleteId,
      plannedSession.discipline,
      "PACE",
      plannedSession.scheduledDate
    );
    thresholdPaceSeconds = paceProfile?.thresholdValue ?? null;
    // Pace boundaries stay pace-based for distance↔duration derivation even when
    // the prescription primary metric is heart rate.
    if (paceProfile) {
      thresholdZoneBoundaries = parseZoneBoundaries(paceProfile.zoneBoundaries);
    }
  }

  const workoutTree = plannedSession.structuredWorkout
    ? parseWorkoutTree(plannedSession.structuredWorkout.steps)
    : undefined;

  const linkedActivity = plannedSession.linkedActivityId
    ? await db.syncedActivity.findFirst({
        where: { id: plannedSession.linkedActivityId, athleteId },
        include: {
          surveyResponse: true,
          zoneBreakdowns: {
            orderBy: [{ isCanonical: "desc" }, { zone: "asc" }],
            include: { thresholdProfile: true },
          },
        },
      })
    : null;

  const linkedActivityView: WorkoutDetailLinkedActivity | null = linkedActivity
    ? {
        id: linkedActivity.id,
        discipline: linkedActivity.discipline,
        rawStreams: linkedActivity.rawStreams,
        durationSeconds: linkedActivity.durationSeconds,
        startTime: linkedActivity.startTime,
        ecos:
          "ecos" in linkedActivity
            ? ((linkedActivity as { ecos?: number | null }).ecos ?? null)
            : null,
        ecoComputed:
          "ecoComputed" in linkedActivity
            ? Boolean((linkedActivity as { ecoComputed?: boolean }).ecoComputed)
            : false,
        surveyResponse: linkedActivity.surveyResponse,
        zoneBreakdowns: linkedActivity.zoneBreakdowns,
      }
    : null;

  let workoutLaps: WorkoutExecutionLap[] | undefined;
  let swimLaps: SwimLapInterval[] | null = null;

  if (linkedActivityView?.rawStreams && typeof linkedActivityView.rawStreams === "object") {
    const streams = linkedActivityView.rawStreams as NormalizedStreams;
    const wl = streams.workoutLaps;
    workoutLaps = Array.isArray(wl) ? wl : wl?.data;
    if (plannedSession.discipline === "SWIM") {
      swimLaps = parseSwimLapIntervals(parseStoredStreams(linkedActivityView.rawStreams));
    }
  }

  const structuredSteps = plannedSession.structuredWorkout?.steps;
  const isEndurance = ENDURANCE_DISCIPLINES.has(plannedSession.discipline as PlanDiscipline);
  const showExecutionChart =
    !!linkedActivityView &&
    (plannedSession.discipline === "BIKE" || plannedSession.discipline === "RUN");

  const hasCompleted = !!linkedActivityView || hasCompletedOverride;
  const hasPlannedMetrics =
    plannedSession.distanceMeters != null ||
    plannedSession.targetSpeedMps != null ||
    plannedSession.targetPaceSeconds != null ||
    plannedSession.targetZones != null;

  const mode = detectWorkoutDetailMode({
    hasCompleted,
    hasStructuredWorkout: !!plannedSession.structuredWorkout,
    hasPlannedMetrics,
    hasNotes: !!(plannedSession.notes && plannedSession.notes.trim()),
    isDefaultTitle: titleMatchesSportDefault(
      plannedSession.title,
      plannedSession.discipline as PlanDiscipline
    ),
    source: plannedSession.source,
  });

  const summaryStats =
    linkedActivityView && linkedActivity && !isEndurance
      ? computeActivitySummary({
          discipline: linkedActivityView.discipline,
          durationSeconds: linkedActivityView.durationSeconds,
          distanceMeters: linkedActivity.distanceMeters,
          streams: parseStoredStreams(linkedActivityView.rawStreams),
          displayUnit,
        })
      : [];

  return {
    mode,
    athleteId,
    returnHref,
    scheduledDateKey: formatDateKey(plannedSession.scheduledDate),
    sessionId: plannedSession.id,
    discipline: plannedSession.discipline,
    title: plannedSession.title,
    notes: plannedSession.notes ?? "",
    distanceMeters: plannedSession.distanceMeters,
    targetSpeedMps: plannedSession.targetSpeedMps,
    targetPaceSeconds: plannedSession.targetPaceSeconds,
    poolSize: plannedSession.poolSize,
    targetZones: plannedSession.targetZones,
    hasStructuredWorkout: !!plannedSession.structuredWorkout,
    disciplineSettings,
    displayUnit,
    completed,
    activityCompleted,
    linkedActivityId: plannedSession.linkedActivityId,
    hasCompletedOverride,
    initialCompletedZones: plannedSession.completedZones,
    workoutTree,
    structuredSteps,
    thresholdPaceSeconds,
    thresholdZoneBoundaries,
    primarySignal,
    sessionSource: plannedSession.source,
    workoutSource: plannedSession.workoutSource,
    selfEvalConfig,
    ecoLoadEnabled,
    linkedActivity: linkedActivityView,
    workoutLaps,
    swimLaps,
    showExecutionChart,
    isEndurance,
    summaryStats,
  };
}
