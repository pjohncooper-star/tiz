import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { auth } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { buildIcalCalendar } from "@/lib/plan/calendar/ical-feed";
import { PLANNED_SESSION_CALENDAR_ORDER_BY } from "@/lib/plan/session-day-order";

const FEED_DAYS = 90;
const TOKEN_RE = /^[a-zA-Z0-9_-]{20,128}$/;

function siteOrigin(request: Request): string {
  const env = process.env.AUTH_URL?.replace(/\/$/, "");
  if (env) return env;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";

  let athleteId: string | null = null;

  if (token) {
    if (!TOKEN_RE.test(token)) {
      return new NextResponse("Invalid token", { status: 401 });
    }
    const athlete = await db.athlete.findFirst({
      where: { calendarFeedToken: token },
      select: { id: true },
    });
    if (!athlete) {
      return new NextResponse("Invalid token", { status: 401 });
    }
    athleteId = athlete.id;
  } else {
    const session = await auth();
    athleteId = session?.user?.athleteId ?? null;
    if (!athleteId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const todayKey = formatDateKey(new Date());
  const from = parseDateKey(todayKey);
  const to = addDays(from, FEED_DAYS);

  const sessions = await db.plannedSession.findMany({
    where: {
      athleteId,
      scheduledDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      notes: true,
      discipline: true,
      scheduledDate: true,
      scheduledTimeMinutes: true,
      estimatedDurationMinutes: true,
    },
    orderBy: PLANNED_SESSION_CALENDAR_ORDER_BY,
  });

  const body = buildIcalCalendar(
    sessions.map((s) => ({
      id: s.id,
      title: s.title,
      notes: s.notes,
      discipline: s.discipline,
      scheduledDate: formatDateKey(s.scheduledDate),
      scheduledTimeMinutes: s.scheduledTimeMinutes ?? null,
      estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
    })),
    { siteOrigin: siteOrigin(request) }
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": 'inline; filename="tiz-workouts.ics"',
    },
  });
}
