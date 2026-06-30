import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import {
  archiveSeasonPlan,
  getSeasonPlanById,
  updateSeasonPlan,
} from "@/lib/plan/season/season-plan.server";
import { updateSeasonPlanSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite, parseLinkCalendarRace } from "@/lib/plan/season/goal-event-api";
import { serializeSeasonPlan } from "@/lib/plan/season/serialize";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const plan = await getSeasonPlanById(athleteId, id);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ season: await serializeSeasonPlan(plan) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSeasonPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const plan = await updateSeasonPlan(athleteId, id, {
      name: data.name,
      startDate: data.startDate ? parseDateKey(data.startDate) : undefined,
      endDate: data.endDate ? parseDateKey(data.endDate) : undefined,
      sportTemplate: data.sportTemplate,
      mesocycleLengthWeeks: data.mesocycleLengthWeeks,
      phases: data.phases,
      startHours: data.startHours,
      peakHours: data.peakHours,
      maxRampPercent: data.maxRampPercent,
      longRideStartMin: data.longRideStartMin,
      longRidePeakMin: data.longRidePeakMin,
      longRunStartMin: data.longRunStartMin,
      longRunPeakMin: data.longRunPeakMin,
      deLoadEveryNWeeks: data.deLoadEveryNWeeks,
      deLoadWeekFlags: data.deLoadWeekFlags,
      deLoadVolumePercent: data.deLoadVolumePercent,
      deLoadStrategy: data.deLoadStrategy,
      reduceCountsOnDeLoad: data.reduceCountsOnDeLoad,
      deLoadCountScalePercent: data.deLoadCountScalePercent,
      setupComplete: data.setupComplete,
      goalEvent: data.goalEvent ? parseGoalEventWrite(data.goalEvent) : undefined,
      bGoalEvents: data.bGoalEvents?.map(parseGoalEventWrite),
      cGoalEvents: data.cGoalEvents?.map(parseGoalEventWrite),
      removedGoalEvents: data.removedGoalEvents,
      linkCalendarRaces: data.linkCalendarRaces?.map(parseLinkCalendarRace),
    });

    return NextResponse.json({ season: await serializeSeasonPlan(plan) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update season";
    const status = message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await archiveSeasonPlan(athleteId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not archive season";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
