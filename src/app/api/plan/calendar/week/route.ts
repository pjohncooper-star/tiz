import { addDays, format } from "date-fns";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function DELETE(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStart = new URL(request.url).searchParams.get("weekStart");
  if (!weekStart || !DATE_KEY.test(weekStart)) {
    return NextResponse.json({ error: "weekStart (yyyy-MM-dd) required" }, { status: 400 });
  }

  const weekStartDate = parseDateKey(weekStart);
  const weekEndDate = parseDateKey(format(addDays(weekStartDate, 6), "yyyy-MM-dd"));

  const planned = await db.plannedSession.findMany({
    where: {
      athleteId,
      source: { not: "RACE" },
      scheduledDate: { gte: weekStartDate, lte: weekEndDate },
    },
    include: { structuredWorkout: { select: { id: true } } },
  });

  if (planned.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const workoutIds = planned
    .map((p) => p.structuredWorkout?.id)
    .filter((id): id is string => Boolean(id));

  await db.$transaction(async (tx) => {
    if (workoutIds.length > 0) {
      await tx.structuredWorkout.deleteMany({ where: { id: { in: workoutIds } } });
    }
    await tx.plannedSession.deleteMany({
      where: { id: { in: planned.map((p) => p.id) } },
    });
  });

  return NextResponse.json({ ok: true, deleted: planned.length });
}
