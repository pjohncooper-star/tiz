import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  daySortOrdersFromIds,
  validateUntimedDayReorder,
} from "@/lib/plan/session-day-order";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const bodySchema = z.object({
  date: z.string().regex(DATE_KEY),
  orderedSessionIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { date, orderedSessionIds } = parsed.data;
  const scheduledDate = parseDateKey(date);

  const daySessions = await db.plannedSession.findMany({
    where: { athleteId, scheduledDate },
    select: {
      id: true,
      title: true,
      scheduledTimeMinutes: true,
      daySortOrder: true,
    },
  });

  const validation = validateUntimedDayReorder({
    daySessions: daySessions.map((s) => ({
      id: s.id,
      title: s.title,
      scheduledTimeMinutes: s.scheduledTimeMinutes ?? null,
      daySortOrder: s.daySortOrder ?? 0,
    })),
    orderedUntimedIds: orderedSessionIds,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const orders = daySortOrdersFromIds(orderedSessionIds);
  await db.$transaction(
    orderedSessionIds.map((id) =>
      db.plannedSession.update({
        where: { id },
        data: { daySortOrder: orders.get(id)! },
      })
    )
  );

  return NextResponse.json({
    ok: true,
    date: formatDateKey(scheduledDate),
    orderedSessionIds,
  });
}
