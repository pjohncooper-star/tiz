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
  type PlannedSessionForEco,
} from "@/lib/eco/hybrid-impulses";
import { nextDateKey } from "@/lib/dates";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function addDaysKey(dateKey: string, days: number): string {
  let cur = dateKey;
  for (let i = 0; i < days; i++) cur = nextDateKey(cur);
  return cur;
}

async function loadHistoryImpulses(athleteId: string): Promise<EcoImpulse[]> {
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
      linkedActivity: { select: { ecos: true } },
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athleteId = session.user.athleteId;
  const enabled = await isEcoLoadEnabledForAthlete(athleteId);
  if (!enabled) {
    return NextResponse.json(
      { error: "ECO load is disabled for this athlete", enabled: false },
      { status: 404 }
    );
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const todayParam = url.searchParams.get("today");
  const includePlan = url.searchParams.get("includePlan") === "1";

  const todayKey =
    todayParam && DATE_KEY.test(todayParam) ? todayParam : utcTodayKey();
  const from =
    fromParam && DATE_KEY.test(fromParam) ? fromParam : undefined;
  const to =
    toParam && DATE_KEY.test(toParam)
      ? toParam
      : includePlan
        ? addDaysKey(todayKey, 90)
        : todayKey;

  const history = await loadHistoryImpulses(athleteId);

  let planned: EcoImpulse[] = [];
  if (includePlan) {
    const planFrom = new Date(`${todayKey}T00:00:00.000Z`);
    const planTo = new Date(`${to}T00:00:00.000Z`);
    const sessions = await loadPlannedForEco(athleteId, planFrom, planTo);
    planned = plannedEcoImpulses({ sessions, todayKey });
  }

  const impulses = includePlan
    ? mergeHistoryAndPlanImpulses(history, planned)
    : history;

  const series = computeFitnessFatigue(impulses, { from, to });

  return NextResponse.json({
    enabled: true,
    includePlan,
    today: todayKey,
    from: series[0]?.date ?? from ?? null,
    to: series[series.length - 1]?.date ?? to,
    tau1: 42,
    tau2: 7,
    plannedImpulseCount: planned.length,
    note: includePlan
      ? "Solid lines are scored history; dashed lines project planned TiZ as ECO (5→8 zone map). τ₁=42 / τ₂=7 are population defaults, not athlete-fit."
      : "Fitness (τ≈42) and fatigue (τ≈7) use population defaults, not athlete-fit values. Days use activity-local time when the source provided an offset.",
    series,
  });
}
