import { NextResponse } from "next/server";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDateKey, WEEK_OPTS } from "@/lib/dates";
import { serializePlannedSessions, signalPrefsFromDisciplineSettings } from "@/lib/plan/calendar/serialize";
import { summarizeWeekPlannedSessions } from "@/lib/plan/calendar/week-summary";
import { getCalendarWeekTargets } from "@/lib/plan/calendar/week-targets.server";
import { loadPaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import type { DisplayUnit } from "@/lib/workout/metrics";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PoolSize } from "@/lib/units/discipline-settings";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Week target + other-session planned zone minutes for the builder budget readout. */
export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const excludeSessionId = url.searchParams.get("excludeSessionId");
  if (!date || !DATE_KEY.test(date)) {
    return NextResponse.json({ error: "date (yyyy-MM-dd) required" }, { status: 400 });
  }

  const weekStart = startOfWeek(parseDateKey(date), WEEK_OPTS);
  const weekEnd = endOfWeek(weekStart, WEEK_OPTS);
  const weekStartKey = format(weekStart, "yyyy-MM-dd");

  const [targets, plannedSessions, disciplineSettings] = await Promise.all([
    getCalendarWeekTargets(athleteId, [weekStartKey]),
    db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate: { gte: weekStart, lte: weekEnd },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      include: {
        structuredWorkout: true,
        linkedActivity: {
          select: {
            id: true,
            name: true,
            startTime: true,
            durationSeconds: true,
            distanceMeters: true,
            rawStreams: true,
            discipline: true,
            legType: true,
            zoneBreakdowns: {
              where: { isCanonical: true },
              select: { zone: true, minutes: true, isCanonical: true },
            },
          },
        },
      },
    }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
  ]);

  const displayUnits = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.displayUnit])
  ) as Partial<Record<string, DisplayUnit>>;
  const defaultPoolSizes = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.poolSize])
  ) as Partial<Record<PlanDiscipline, PoolSize | null>>;
  const signalPrefs = signalPrefsFromDisciplineSettings(disciplineSettings);

  const paceContext = await loadPaceThresholdContext(athleteId);
  const serialized = serializePlannedSessions(
    plannedSessions,
    displayUnits,
    defaultPoolSizes,
    signalPrefs,
    paceContext
  );
  const summary = summarizeWeekPlannedSessions(serialized);

  return NextResponse.json({
    weekTarget: targets[0] ?? null,
    plannedZoneMinutes: summary.total.zoneMinutes,
  });
}
