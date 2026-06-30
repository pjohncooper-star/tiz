import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeWeek } from "@/lib/plan/season/serialize";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const plan = await db.seasonPlan.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const weeks = await db.seasonWeek.findMany({
    where: { seasonPlanId: id },
    orderBy: { weekIndex: "asc" },
  });

  return NextResponse.json({ weeks: weeks.map(serializeWeek) });
}
