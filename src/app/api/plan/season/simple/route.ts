import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDateKey } from "@/lib/dates";
import { isSimpleSeasonPlannerEnabled } from "@/lib/features";
import { createSimpleSeasonSchema } from "@/lib/plan/api-schemas";
import { parseGoalEventWrite } from "@/lib/plan/season/goal-event-api";
import {
  createSimpleSeasonPlan,
  loadAthleteZoneFocusCatalog,
  serializeSimpleSeasonPlan,
} from "@/lib/plan/season/simple-planner.server";
import { parseSimpleRampDefaultsFromApi } from "@/lib/plan/season/simple-ramp";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { fetchTrainerRoadIcs } from "@/lib/plan/trainerroad/sync";
import {
  athleteHasTrainerRoadCalendar,
  createSeasonFromTrainerRoadCalendar,
  getTrainerRoadIcalUrl,
} from "@/lib/plan/trainerroad/season.server";

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

  try {
    const [plan, trainerRoadCalendarSaved] = await Promise.all([
      getSimplePlannerSeason(athleteId, seasonId),
      athleteHasTrainerRoadCalendar(athleteId),
    ]);
    const zoneFocusCatalog = await loadAthleteZoneFocusCatalog(athleteId);

    if (!plan) {
      return NextResponse.json({
        season: null,
        zoneFocusCatalog,
        trainerRoadCalendarSaved,
      });
    }

    return NextResponse.json({
      season: serializeSimpleSeasonPlan(plan),
      zoneFocusCatalog,
      trainerRoadCalendarSaved,
    });
  } catch (err) {
    console.error("GET /api/plan/season/simple failed", err);
    const message = err instanceof Error ? err.message : "Could not load season plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  if (data.trainerRoadDriven) {
    if (!data.goalEvent?.name.trim() || !data.goalEvent.date) {
      return NextResponse.json(
        { error: "A Race name and date are required to follow TrainerRoad phases." },
        { status: 400 }
      );
    }
  }

  try {
    if (data.trainerRoadDriven) {
      const url = await getTrainerRoadIcalUrl(athleteId);
      if (!url) {
        return NextResponse.json(
          { error: "Save a TrainerRoad calendar URL in Settings first." },
          { status: 400 }
        );
      }
      const ics = await fetchTrainerRoadIcs(url);
      const plan = await createSeasonFromTrainerRoadCalendar(athleteId, ics, {
        name: data.name,
        startDate: parseDateKey(data.startDate),
        endDate: parseDateKey(data.endDate),
        goalEvent: parseGoalEventWrite(data.goalEvent!),
      });
      const zoneFocusCatalog = await loadAthleteZoneFocusCatalog(athleteId);
      return NextResponse.json(
        { season: serializeSimpleSeasonPlan(plan), zoneFocusCatalog },
        { status: 201 }
      );
    }

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

    const zoneFocusCatalog = await loadAthleteZoneFocusCatalog(athleteId);
    return NextResponse.json(
      { season: serializeSimpleSeasonPlan(plan), zoneFocusCatalog },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create season";
    const status = /calendar URL|phase markers|A Race/i.test(message) ? 400 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
