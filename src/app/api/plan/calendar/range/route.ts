import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordedActivityWhere } from "@/lib/import/classify";
import { serializePlannedSessions, parseDateKey } from "@/lib/plan/calendar/serialize";
import { serializeCalendarActivities } from "@/lib/plan/calendar/activity-serialize";
import { weekStartsInRange } from "@/lib/plan/calendar/template.server";
import type { DisplayUnit } from "@/lib/workout/metrics";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PoolSize } from "@/lib/units/discipline-settings";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !DATE_KEY.test(from) || !DATE_KEY.test(to)) {
    return NextResponse.json({ error: "from and to (yyyy-MM-dd) required" }, { status: 400 });
  }

  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);
  if (toDate < fromDate) {
    return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  }

  const [plannedSessions, activities, disciplineSettings] = await Promise.all([
    db.plannedSession.findMany({
      where: {
        athleteId,
        scheduledDate: { gte: fromDate, lte: toDate },
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
      orderBy: [{ scheduledDate: "asc" }, { title: "asc" }],
    }),
    db.syncedActivity.findMany({
      where: {
        athleteId,
        startTime: { gte: fromDate, lte: toDate },
        ...recordedActivityWhere,
      },
      include: { zoneBreakdowns: { where: { isCanonical: true } } },
      orderBy: { startTime: "asc" },
    }),
    db.athleteDisciplineSettings.findMany({ where: { athleteId } }),
  ]);

  const displayUnits = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.displayUnit])
  ) as Partial<Record<string, DisplayUnit>>;

  const primarySignals = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.primarySignal])
  );

  const defaultPoolSizes = Object.fromEntries(
    disciplineSettings.map((s) => [s.discipline, s.poolSize])
  ) as Partial<Record<PlanDiscipline, PoolSize | null>>;

  const weekActivities = serializeCalendarActivities(activities);

  return NextResponse.json({
    sessions: serializePlannedSessions(
      plannedSessions,
      displayUnits,
      defaultPoolSizes,
      primarySignals
    ),
    activities: weekActivities,
    weekStarts: weekStartsInRange(from, to),
  });
}
