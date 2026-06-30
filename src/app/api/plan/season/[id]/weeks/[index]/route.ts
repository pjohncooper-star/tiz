import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeWeek } from "@/lib/plan/season/serialize";

type RouteContext = { params: Promise<{ id: string; index: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, index: indexStr } = await context.params;
  const weekIndex = Number(indexStr);
  if (!Number.isInteger(weekIndex) || weekIndex < 0) {
    return NextResponse.json({ error: "Invalid week index" }, { status: 400 });
  }

  const plan = await db.seasonPlan.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const week = await db.seasonWeek.findUnique({
    where: { seasonPlanId_weekIndex: { seasonPlanId: id, weekIndex } },
  });
  if (!week) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  return NextResponse.json({ week: serializeWeek(week) });
}
