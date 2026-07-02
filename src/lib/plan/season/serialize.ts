import { formatDateKey, calendarDateFromDb } from "@/lib/dates";
import { parseDeLoadWeekFlags } from "./de-load-cadence";
import {
  findUnlinkedRaceSessions,
  goalEventDisciplinesFromSession,
} from "@/lib/plan/race-calendar-sync";
import { seasonPlanToSummary, type SeasonPlanSummary } from "./season-plan.server";

type SeasonPlanRecord = NonNullable<Awaited<ReturnType<typeof import("./season-plan.server").getSeasonPlanById>>>;

export function serializeGoalEvent(event: {
  id: string;
  name: string;
  date: Date;
  disciplines: string[];
  priority: string;
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  plannedSessionId?: string | null;
  taperDaysBefore: number | null;
  notes: string | null;
}) {
  return {
    id: event.id,
    name: event.name,
    date: formatDateKey(event.date),
    disciplines: event.disciplines,
    priority: event.priority,
    distanceMeters: event.distanceMeters ?? null,
    estimatedDurationMinutes: event.estimatedDurationMinutes ?? null,
    swimGoalMinutes: event.swimGoalMinutes ?? null,
    bikeGoalMinutes: event.bikeGoalMinutes ?? null,
    runGoalMinutes: event.runGoalMinutes ?? null,
    plannedSessionId: event.plannedSessionId ?? null,
    taperDaysBefore: event.taperDaysBefore,
    notes: event.notes,
  };
}

export function serializeUnlinkedRaceSession(session: {
  id: string;
  scheduledDate: Date;
  title: string;
  discipline: string;
  distanceMeters: number | null;
  estimatedDurationMinutes: number | null;
  multisportGroupId: string | null;
  notes: string | null;
}, siblings: { discipline: string }[] = []) {
  return {
    plannedSessionId: session.id,
    name: session.title,
    date: formatDateKey(session.scheduledDate),
    disciplines: goalEventDisciplinesFromSession(
      session as Parameters<typeof goalEventDisciplinesFromSession>[0],
      siblings as Parameters<typeof goalEventDisciplinesFromSession>[1]
    ),
    distanceMeters: session.distanceMeters,
    estimatedDurationMinutes: session.estimatedDurationMinutes,
    multisportGroupId: session.multisportGroupId,
    notes: session.notes,
  };
}
export function serializePhase(phase: SeasonPlanRecord["phases"][number]) {
  return {
    id: phase.id,
    name: phase.name,
    sortOrder: phase.sortOrder,
    weekCount: phase.weekCount,
    phaseKind: phase.phaseKind,
    color: phase.color,
    coachNotes: phase.coachNotes,
    focusMode: phase.focusMode,
    phaseFocus: phase.phaseFocus,
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    disciplineFocuses: phase.disciplines.map((d) => ({
      discipline: d.discipline,
      focus: d.focus,
    })),
    mesocycles: "mesocycles" in phase
      ? (phase.mesocycles as { id: string; name: string; index: number; startWeekIndex: number; endWeekIndex: number }[]).map(
          (m) => ({
            id: m.id,
            name: m.name,
            index: m.index,
            startWeekIndex: m.startWeekIndex,
            endWeekIndex: m.endWeekIndex,
          })
        )
      : undefined,
  };
}

export function serializeWeek(week: SeasonPlanRecord["weeks"][number]) {
  return {
    id: week.id,
    weekIndex: week.weekIndex,
    weekStartDate: formatDateKey(week.weekStartDate),
    isDeLoadWeek: week.isDeLoadWeek,
    mesocycleId: week.mesocycleId,
    totalHours: week.totalHours,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    zoneMinutes: week.zoneMinutes,
    swimSessions: week.swimSessions,
    bikeSessions: week.bikeSessions,
    runSessions: week.runSessions,
    longRideMinutes: week.longRideMinutes,
    longRunMinutes: week.longRunMinutes,
  };
}

export async function serializeSeasonPlan(plan: SeasonPlanRecord) {
  const startDate = calendarDateFromDb(plan.startDate);
  const endDate = calendarDateFromDb(plan.endDate);
  const unlinked = await findUnlinkedRaceSessions(plan.athleteId, startDate, endDate);
  const { db } = await import("@/lib/db");
  const unlinkedSerialized = await Promise.all(
    unlinked.map(async (session) => {
      const siblings = session.multisportGroupId
        ? await db.plannedSession.findMany({
            where: { multisportGroupId: session.multisportGroupId },
            orderBy: { sessionIndex: "asc" },
          })
        : [];
      return serializeUnlinkedRaceSession(session, siblings);
    })
  );

  return {
    id: plan.id,
    name: plan.name,
    sportTemplate: plan.sportTemplate,
    startDate: formatDateKey(plan.startDate),
    endDate: formatDateKey(plan.endDate),
    totalWeeks: plan.totalWeeks,
    status: plan.status,
    setupComplete: plan.setupComplete,
    mesocycleLengthWeeks: plan.mesocycleLengthWeeks,
    startHours: plan.startHours,
    peakHours: plan.peakHours,
    maxRampPercent: plan.maxRampPercent,
    deLoadEveryNWeeks: plan.deLoadEveryNWeeks,
    deLoadWeekFlags: parseDeLoadWeekFlags(plan.deLoadWeekFlags),
    deLoadVolumePercent: plan.deLoadVolumePercent,
    deLoadStrategy: plan.deLoadStrategy,
    reduceCountsOnDeLoad: plan.reduceCountsOnDeLoad,
    deLoadCountScalePercent: plan.deLoadCountScalePercent,
    longRideStartMin: plan.longRideStartMin,
    longRidePeakMin: plan.longRidePeakMin,
    longRunStartMin: plan.longRunStartMin,
    longRunPeakMin: plan.longRunPeakMin,
    primaryGoalEvent: plan.primaryGoalEvent
      ? serializeGoalEvent(plan.primaryGoalEvent)
      : null,
    goalEvents: plan.goalEvents?.map(serializeGoalEvent) ?? [],
    unlinkedRaceSessions: unlinkedSerialized,
    phases: plan.phases.map(serializePhase),
    weeks: plan.weeks.map(serializeWeek),
  };
}
export function serializeSeasonSummary(
  plan: Parameters<typeof seasonPlanToSummary>[0]
): Omit<SeasonPlanSummary, "startDate" | "endDate"> & {
  startDate: string;
  endDate: string;
} {
  const summary = seasonPlanToSummary(plan);
  return {
    ...summary,
    startDate: formatDateKey(summary.startDate),
    endDate: formatDateKey(summary.endDate),
  };
}
