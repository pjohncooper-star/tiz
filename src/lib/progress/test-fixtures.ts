import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { ProgressActivity } from "./week-progress";

export function plannedSession(
  partial: Partial<CalendarPlannedSession> & Pick<CalendarPlannedSession, "id" | "title">
): CalendarPlannedSession {
  return {
    scheduledDate: "2026-08-17",
    scheduledTimeMinutes: null,
    daySortOrder: 0,
    discipline: "RUN",
    totalMinutes: 60,
    plannedMinutes: 60,
    distanceMeters: null,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: false,
    source: "FLEXIBLE",
    poolSize: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: 60,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole: "EASY",
    displaySessionRole: "EASY",
    tizSignalOverride: null,
    poolSlotKind: null,
    ...partial,
  };
}

export function progressActivity(
  partial: Partial<ProgressActivity> & Pick<ProgressActivity, "id" | "name">
): ProgressActivity {
  return {
    startTime: "2026-08-17T14:00:00.000Z",
    dateKey: "2026-08-17",
    discipline: "RUN",
    source: "STRAVA",
    signalUsed: null,
    noUsableSignal: false,
    durationSeconds: 3600,
    distanceMeters: 10000,
    zoneMinutes: {},
    ecos: null,
    multisportGroupId: null,
    sessionIndex: null,
    legType: null,
    ...partial,
  };
}

export function weekTarget(
  partial: Partial<CalendarWeekTarget> & Pick<CalendarWeekTarget, "weekStart">
): CalendarWeekTarget {
  return {
    weekIndex: 0,
    isRestWeek: false,
    totalHours: 6,
    phase: { name: "Base", color: "#0ea5e9" },
    strengthSessionsPerWeek: 0,
    byDiscipline: [
      { discipline: "SWIM", hours: 1, zoneMinutes: {}, sessionsPerWeek: 2, intenseDaysPerWeek: 0 },
      { discipline: "BIKE", hours: 3, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
      { discipline: "RUN", hours: 2, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
    ],
    zoneMinutes: {},
    ...partial,
  };
}
