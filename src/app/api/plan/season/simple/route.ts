import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { isSimpleSeasonPlannerEnabled } from "@/lib/features";
import { createSimpleSeasonSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite } from "@/lib/plan/season/goal-event-api";
import {
  createSimpleSeasonPlan,
  serializeSimpleSeasonPlan,
} from "@/lib/plan/season/simple-planner.server";
import {
  getCurrentSeasonPlan,
  getSeasonPlanById,
} from "@/lib/plan/season/season-plan.server";

export async function GET(request: Request) {
  if (!isSimpleSeasonPlannerEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  return NextResponse.json({ season: serializeSimpleSeasonPlan(plan) });
}

export async function POST(request: Request) {
  if (!isSimpleSeasonPlannerEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const parsed = createSimpleSeasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const plan = await createSimpleSeasonPlan({
      athleteId,
      name: data.name,
      startDate: parseDateKey(data.startDate),
      endDate: parseDateKey(data.endDate),
      rampDefaults: data.rampDefaults,
      goalEvent: data.goalEvent ? parseGoalEventWrite(data.goalEvent) : undefined,
      bGoalEvents: data.bGoalEvents?.map(parseGoalEventWrite),
      cGoalEvents: data.cGoalEvents?.map(parseGoalEventWrite),
    });

    if (!plan) {
      return NextResponse.json({ error: "Could not create season" }, { status: 500 });
    }

    return NextResponse.json(
      { season: serializeSimpleSeasonPlan(plan) },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create season";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
