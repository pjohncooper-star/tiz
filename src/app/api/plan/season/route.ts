import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import {
  createSeasonPlan,
  getCurrentSeasonPlan,
  getSeasonPlanById,
} from "@/lib/plan/season/season-plan.server";
import { suggestPhasesForWeeks } from "@/lib/plan/season/default-phases";
import { buildSeasonDateBounds } from "@/lib/plan/season/season-dates";
import { createSeasonPlanSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite } from "@/lib/plan/season/goal-event-api";
import { serializeSeasonPlan } from "@/lib/plan/season/serialize";

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonId = new URL(request.url).searchParams.get("seasonId");
  const plan = seasonId
    ? await getSeasonPlanById(athleteId, seasonId)
    : await getCurrentSeasonPlan(athleteId);
  if (!plan) {
    return NextResponse.json({ season: null });
  }

  return NextResponse.json({ season: await serializeSeasonPlan(plan) });
}

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

  const parsed = createSeasonPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const startDate = parseDateKey(data.startDate);
  const endDate = parseDateKey(data.endDate);
  const bounds = buildSeasonDateBounds(startDate, endDate);
  const phases =
    data.phases ??
    suggestPhasesForWeeks(bounds.totalWeeks).map((p, i) => ({
      ...p,
      sortOrder: i,
    }));

  try {
    const plan = await createSeasonPlan({
      athleteId,
      name: data.name,
      sportTemplate: data.sportTemplate,
      startDate,
      endDate,
      mesocycleLengthWeeks: data.mesocycleLengthWeeks,
      startHours: data.startHours ?? 8,
      peakHours: data.peakHours ?? 12,
      maxRampPercent: data.maxRampPercent,
      phases,
      goalEvent: parseGoalEventWrite(data.goalEvent),
      bGoalEvents: data.bGoalEvents?.map(parseGoalEventWrite),
      cGoalEvents: data.cGoalEvents?.map(parseGoalEventWrite),
    });

    return NextResponse.json({ season: await serializeSeasonPlan(plan) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create season";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
