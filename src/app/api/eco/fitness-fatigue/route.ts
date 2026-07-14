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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

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
  const from =
    fromParam && DATE_KEY.test(fromParam) ? fromParam : undefined;
  const to = toParam && DATE_KEY.test(toParam) ? toParam : utcTodayKey();

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

  const impulses: EcoImpulse[] = activities
    .filter((a) => a.ecos != null && Number.isFinite(a.ecos) && a.ecos > 0)
    .map((a) => ({
      startTime: a.startTime,
      utcOffsetSeconds: a.utcOffsetSeconds,
      discipline: a.discipline,
      ecos: a.ecos!,
    }));

  const series = computeFitnessFatigue(impulses, { from, to });

  return NextResponse.json({
    enabled: true,
    from: series[0]?.date ?? from ?? null,
    to: series[series.length - 1]?.date ?? to,
    tau1: 42,
    tau2: 7,
    note:
      "Fitness (τ≈42) and fatigue (τ≈7) use population defaults, not athlete-fit values. Days use activity-local time when the source provided an offset.",
    series,
  });
}
