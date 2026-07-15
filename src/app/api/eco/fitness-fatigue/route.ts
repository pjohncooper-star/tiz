import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import { isEcoLoadEnabledForAthlete } from "@/lib/eco/preference";
import {
  computeFitnessFatigue,
  utcTodayKey,
  type EcoImpulse,
} from "@/lib/eco/fitness-fatigue";
import {
  mergeHistoryAndPlanImpulses,
  plannedEcoImpulses,
  seasonWeekEcoImpulses,
  type PlannedSessionForEco,
} from "@/lib/eco/hybrid-impulses";
import {
  hoursFromTiZOrDuration,
  plannedHoursImpulses,
  seasonWeekHoursImpulses,
  type PlannedSessionForHours,
} from "@/lib/eco/hours-impulses";
import { formatDateKey, nextDateKey } from "@/lib/dates";
import { parseDisciplineZoneMinutes } from "@/lib/plan/season/simple-tiz";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addDaysKey(dateKey: string, days: number): string {
  let cur = dateKey;
  for (let i = 0; i < days; i++) cur = nextDateKey(cur);
  return cur;
}

function serializeImpulse(impulse: EcoImpulse) {
  return {
    startTime: impulse.startTime.toISOString(),
    utcOffsetSeconds: impulse.utcOffsetSeconds ?? null,
    discipline: impulse.discipline,
    ecos: impulse.ecos,
  };
}

async function loadHistoryEcoImpulses(athleteId: string): Promise<EcoImpulse[]> {
  let activities: Array<{
    startTime: Date;
    utcOffsetSeconds: number | null;
    discipline: string;
    ecos: number | null;
  }>;

  try {
    activities = await db.syncedActivity.findMany({
      where: {
        athleteId,
        ecos: { not: null },
        discipline: { in: ["SWIM", "BIKE", "RUN"] },
        ...recordedActivityWhere,
      },
      select: {
        startTime: true,
        utcOffsetSeconds: true,
        discipline: true,
        ecos: true,
      },
      orderBy: { startTime: "asc" },
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/utcOffsetSeconds|UtcOffsetSeconds|column/.test(error.message)
    ) {
      throw error;
    }
    const rows = await db.syncedActivity.findMany({
      where: {
        athleteId,
        ecos: { not: null },
        discipline: { in: ["SWIM", "BIKE", "RUN"] },
        ...recordedActivityWhere,
      },
      select: {
        startTime: true,
        discipline: true,
        ecos: true,
      },
      orderBy: { startTime: "asc" },
    });
    activities = rows.map((r) => ({ ...r, utcOffsetSeconds: null }));
  }

  return activities
    .filter((a) => a.ecos != null && Number.isFinite(a.ecos) && a.ecos > 0)
    .map((a) => ({
      startTime: a.startTime,
      utcOffsetSeconds: a.utcOffsetSeconds,
      discipline: a.discipline,
      ecos: a.ecos!,
    }));
}

async function loadHistoryHoursImpulses(athleteId: string): Promise<EcoImpulse[]> {
  const activities = await db.syncedActivity.findMany({
    where: {
      athleteId,
      discipline: { in: ["SWIM", "BIKE", "RUN"] },
      ...recordedActivityWhere,
    },
    select: {
      startTime: true,
      utcOffsetSeconds: true,
      discipline: true,
      durationSeconds: true,
      zoneBreakdowns: {
        where: { isCanonical: true },
        select: { zone: true, minutes: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const impulses: EcoImpulse[] = [];
  for (const a of activities) {
    const zoneMinutes: ZoneMinutes = {};
    for (const zb of a.zoneBreakdowns) {
      if (!(zb.minutes > 0)) continue;
      const key = zoneKey(a.discipline as "SWIM" | "BIKE" | "RUN", zb.zone);
      zoneMinutes[key] = (zoneMinutes[key] ?? 0) + zb.minutes;
    }
    const hours = hoursFromTiZOrDuration({
      zoneMinutes,
      durationSeconds: a.durationSeconds,
    });
    if (!(hours > 0)) continue;
    impulses.push({
      startTime: a.startTime,
      utcOffsetSeconds: a.utcOffsetSeconds,
      discipline: a.discipline,
      ecos: hours,
    });
  }
  return impulses;
}

async function loadPlannedForEco(
  athleteId: string,
  fromDate: Date,
  toDate: Date
): Promise<PlannedSessionForEco[]> {
  const rows = await db.plannedSession.findMany({
    where: {
      athleteId,
      discipline: { in: ["SWIM", "BIKE", "RUN"] },
      scheduledDate: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      scheduledDate: true,
      discipline: true,
      targetZones: true,
      estimatedDurationMinutes: true,
      zoneAllocationMissing: true,
      multisportGroupId: true,
      sessionIndex: true,
      structuredWorkout: { select: { steps: true } },
      linkedActivity: { select: { ecos: true, durationSeconds: true } },
    },
    orderBy: [{ scheduledDate: "asc" }, { sessionIndex: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    scheduledDate: row.scheduledDate,
    discipline: row.discipline,
    targetZones: row.targetZones,
    durationMinutes: row.estimatedDurationMinutes,
    zoneAllocationMissing: row.zoneAllocationMissing,
    structuredSteps: row.structuredWorkout?.steps,
    multisportGroupId: row.multisportGroupId,
    sessionIndex: row.sessionIndex,
    linkedActivityHasEcos:
      row.linkedActivity?.ecos != null &&
      Number.isFinite(row.linkedActivity.ecos) &&
      row.linkedActivity.ecos > 0,
  }));
}

async function loadPlannedForHours(
  athleteId: string,
  fromDate: Date,
  toDate: Date
): Promise<PlannedSessionForHours[]> {
  const rows = await db.plannedSession.findMany({
    where: {
      athleteId,
      discipline: { in: ["SWIM", "BIKE", "RUN"] },
      scheduledDate: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      scheduledDate: true,
      discipline: true,
      targetZones: true,
      estimatedDurationMinutes: true,
      zoneAllocationMissing: true,
      structuredWorkout: { select: { steps: true } },
      linkedActivity: {
        select: {
          durationSeconds: true,
          zoneBreakdowns: {
            where: { isCanonical: true },
            select: { minutes: true },
          },
        },
      },
    },
    orderBy: [{ scheduledDate: "asc" }, { sessionIndex: "asc" }],
  });

  return rows.map((row) => {
    const linkedMinutes =
      row.linkedActivity?.zoneBreakdowns.reduce((s, z) => s + (z.minutes > 0 ? z.minutes : 0), 0) ??
      0;
    const linkedHours = hoursFromTiZOrDuration({
      durationMinutes: linkedMinutes > 0 ? linkedMinutes : null,
      durationSeconds: row.linkedActivity?.durationSeconds,
    });
    return {
      id: row.id,
      scheduledDate: row.scheduledDate,
      discipline: row.discipline,
      targetZones: row.targetZones,
      durationMinutes: row.estimatedDurationMinutes,
      zoneAllocationMissing: row.zoneAllocationMissing,
      structuredSteps: row.structuredWorkout?.steps,
      linkedActivityHasHours: linkedHours > 0,
    };
  });
}

async function loadSeasonWeeks(
  athleteId: string,
  seasonId: string
): Promise<Array<{ weekStartDate: string; zoneMinutes: ZoneMinutes; isRestWeek: boolean }>> {
  const plan = await db.seasonPlan.findFirst({
    where: { id: seasonId, athleteId },
    select: {
      weeks: {
        select: {
          weekStartDate: true,
          zoneMinutes: true,
          isDeLoadWeek: true,
        },
        orderBy: { weekIndex: "asc" },
      },
    },
  });
  if (!plan) return [];
  return plan.weeks.map((week) => ({
    weekStartDate: formatDateKey(week.weekStartDate),
    zoneMinutes: parseDisciplineZoneMinutes(week.zoneMinutes),
    isRestWeek: week.isDeLoadWeek,
  }));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athleteId = session.user.athleteId;
  const ecoEnabled = await isEcoLoadEnabledForAthlete(athleteId);
  const loadMode = ecoEnabled ? "eco" : "hours";

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const todayParam = url.searchParams.get("today");
  const includePlan = url.searchParams.get("includePlan") === "1";
  const seasonId = url.searchParams.get("seasonId");

  const todayKey =
    todayParam && DATE_KEY.test(todayParam) ? todayParam : utcTodayKey();
  const from =
    fromParam && DATE_KEY.test(fromParam) ? fromParam : undefined;
  const to =
    toParam && DATE_KEY.test(toParam)
      ? toParam
      : includePlan || seasonId
        ? addDaysKey(todayKey, 90)
        : todayKey;

  const history =
    loadMode === "eco"
      ? await loadHistoryEcoImpulses(athleteId)
      : await loadHistoryHoursImpulses(athleteId);

  let planned: EcoImpulse[] = [];
  if (includePlan) {
    const planFrom = new Date(`${todayKey}T00:00:00.000Z`);
    const planTo = new Date(`${to}T00:00:00.000Z`);
    if (loadMode === "eco") {
      const sessions = await loadPlannedForEco(athleteId, planFrom, planTo);
      planned = plannedEcoImpulses({ sessions, todayKey });
    } else {
      const sessions = await loadPlannedForHours(athleteId, planFrom, planTo);
      planned = plannedHoursImpulses({ sessions, todayKey });
    }
  }

  if (seasonId) {
    const weeks = await loadSeasonWeeks(athleteId, seasonId);
    planned = [
      ...planned,
      ...(loadMode === "eco"
        ? seasonWeekEcoImpulses({ weeks, todayKey })
        : seasonWeekHoursImpulses({ weeks, todayKey })),
    ];
  }

  const impulses =
    includePlan || seasonId
      ? mergeHistoryAndPlanImpulses(history, planned)
      : history;

  const series = computeFitnessFatigue(impulses, { from, to });

  return NextResponse.json({
    enabled: true,
    ecoEnabled,
    loadMode,
    loadUnit: loadMode === "eco" ? "ECO" : "hours",
    includePlan,
    seasonId: seasonId || null,
    today: todayKey,
    from: series[0]?.date ?? from ?? null,
    to: series[series.length - 1]?.date ?? to,
    tau1: 42,
    tau2: 7,
    plannedImpulseCount: planned.length,
    history: history.map(serializeImpulse),
    note:
      loadMode === "hours"
        ? includePlan || seasonId
          ? "Solid lines are TiZ/hours history; dashed lines project planned session or season volume as hours. τ₁=42 / τ₂=7 are population defaults."
          : "Fitness (τ≈42) and fatigue (τ≈7) use TiZ minutes when available, otherwise activity duration hours. Population default time constants."
        : includePlan || seasonId
          ? "Solid lines are scored history; dashed lines project planned / season TiZ as ECO (5→8 zone map). τ₁=42 / τ₂=7 are population defaults, not athlete-fit."
          : "Fitness (τ≈42) and fatigue (τ≈7) use population defaults, not athlete-fit values. Days use activity-local time when the source provided an offset.",
    series,
  });
}
