import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { createSimpleSeasonSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite } from "@/lib/plan/season/goal-event-api";
import {
  createSimpleSeasonPlan,
  serializeSimpleSeasonPlan,
} from "@/lib/plan/season/simple-planner.server";
import { parseSimpleRampDefaultsFromApi } from "@/lib/plan/season/simple-ramp";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonId = new URL(request.url).searchParams.get("seasonId");

  try {
    const plan = await getSimplePlannerSeason(athleteId, seasonId);

    if (!plan) {
      return NextResponse.json({ season: null });
    }

    return NextResponse.json({ season: await serializeSimpleSeasonPlan(plan) });
  } catch (err) {
    console.error("GET /api/plan/season failed", err);
    const message = err instanceof Error ? err.message : "Could not load season plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
      rampDefaults: data.rampDefaults
        ? parseSimpleRampDefaultsFromApi(data.rampDefaults)
        : undefined,
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
