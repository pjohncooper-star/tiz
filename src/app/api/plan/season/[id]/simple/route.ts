import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { isSimpleSeasonPlannerEnabled } from "@/lib/features";
import { updateSimpleSeasonSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite } from "@/lib/plan/season/goal-event-api";
import {
  serializeSimpleSeasonPlan,
  updateSimpleSeasonPlan,
  loadAthleteZoneFocusCatalog,
} from "@/lib/plan/season/simple-planner.server";
import { parseSimpleRampDefaultsFromApi } from "@/lib/plan/season/simple-ramp";
import { getSeasonPlanById } from "@/lib/plan/season/season-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isSimpleSeasonPlannerEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const plan = await getSeasonPlanById(athleteId, id);
    if (!plan) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const zoneFocusCatalog = await loadAthleteZoneFocusCatalog(athleteId);
    return NextResponse.json({ season: serializeSimpleSeasonPlan(plan), zoneFocusCatalog });
  } catch (err) {
    console.error(`GET /api/plan/season/${id}/simple failed`, err);
    const message = err instanceof Error ? err.message : "Could not load season plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSimpleSeasonPlannerEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const parsed = updateSimpleSeasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const plan = await updateSimpleSeasonPlan(athleteId, id, {
      name: data.name,
      startDate: data.startDate ? parseDateKey(data.startDate) : undefined,
      endDate: data.endDate ? parseDateKey(data.endDate) : undefined,
      rampDefaults: data.rampDefaults
        ? parseSimpleRampDefaultsFromApi(data.rampDefaults)
        : undefined,
      deLoadVolumePercent: data.deLoadVolumePercent,
      phaseKindZoneDefaults: data.phaseKindZoneDefaults,
      defaultPlanningMode: data.defaultPlanningMode,
      phases: data.phases,
      weeks: data.weeks,
      recalculate: data.recalculate,
      goalEvent: data.goalEvent ? parseGoalEventWrite(data.goalEvent) : undefined,
      bGoalEvents: data.bGoalEvents?.map(parseGoalEventWrite),
      cGoalEvents: data.cGoalEvents?.map(parseGoalEventWrite),
      removedGoalEvents: data.removedGoalEvents,
      longRideWeekFlags: data.longRideWeekFlags,
      longRunWeekFlags: data.longRunWeekFlags,
      testWeekFlags: data.testWeekFlags,
      restWeekTemplateId: data.restWeekTemplateId,
      testWeekTemplateId: data.testWeekTemplateId,
    });

    if (!plan) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const zoneFocusCatalog = await loadAthleteZoneFocusCatalog(athleteId);
    return NextResponse.json({ season: serializeSimpleSeasonPlan(plan), zoneFocusCatalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update season";
    const status = message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
