import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { endDateKey, parseDateKey } from "@/lib/dates";
import { recordedActivityWhere } from "@/lib/import/classify";
import {
  computeLongestByDistance,
  computePowerDurationCurve,
  computeRunPaceDurationCurve,
  computeWeeklyVolumeHours,
  computeZoneMix,
  type ActivityForCurves,
  type ActivityForLongest,
  type ActivityForVolume,
} from "@/lib/dashboard/glance-metrics";
import { parseDashboardDateParam } from "@/lib/dashboard/date-range";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athleteId = session.user.athleteId;
  const url = new URL(req.url);
  const from = parseDashboardDateParam(url.searchParams.get("from"));
  const to = parseDashboardDateParam(url.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to (yyyy-MM-dd) are required" },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be ≤ to" }, { status: 400 });
  }

  const activities = await db.syncedActivity.findMany({
    where: {
      athleteId,
      startTime: { gte: parseDateKey(from), lte: endDateKey(to) },
      discipline: { in: ["SWIM", "BIKE", "RUN"] },
      ...recordedActivityWhere,
    },
    select: {
      id: true,
      name: true,
      startTime: true,
      utcOffsetSeconds: true,
      discipline: true,
      durationSeconds: true,
      distanceMeters: true,
      rawStreams: true,
      zoneBreakdowns: {
        where: { isCanonical: true },
        select: { zone: true, minutes: true, isCanonical: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const forCurves: ActivityForCurves[] = activities.map((a) => ({
    discipline: a.discipline,
    durationSeconds: a.durationSeconds,
    rawStreams: a.rawStreams,
  }));
  const forVolume: ActivityForVolume[] = activities.map((a) => ({
    startTime: a.startTime,
    utcOffsetSeconds: a.utcOffsetSeconds,
    discipline: a.discipline,
    durationSeconds: a.durationSeconds,
    zoneBreakdowns: a.zoneBreakdowns,
  }));
  const forLongest: ActivityForLongest[] = activities.map((a) => ({
    id: a.id,
    name: a.name,
    startTime: a.startTime,
    utcOffsetSeconds: a.utcOffsetSeconds,
    discipline: a.discipline,
    durationSeconds: a.durationSeconds,
    distanceMeters: a.distanceMeters,
  }));

  const power = computePowerDurationCurve(forCurves);
  const runPace = computeRunPaceDurationCurve(forCurves);
  const weeklyVolume = computeWeeklyVolumeHours(forVolume);
  const zoneMix = computeZoneMix(forVolume);
  const longestRun = computeLongestByDistance(forLongest, "RUN");
  const longestRide = computeLongestByDistance(forLongest, "BIKE");

  return NextResponse.json({
    from,
    to,
    power,
    runPace,
    weeklyVolume,
    zoneMix,
    longestRun,
    longestRide,
    activityCount: activities.length,
  });
}
