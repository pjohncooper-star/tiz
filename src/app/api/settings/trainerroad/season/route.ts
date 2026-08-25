import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchTrainerRoadIcs } from "@/lib/plan/trainerroad/sync";
import {
  createTrainerRoadSeason,
  getLinkedTrainerRoadSeason,
} from "@/lib/plan/trainerroad/season.server";
import { TrainerRoadSeasonOverlapError } from "@/lib/plan/trainerroad/season";

export async function POST() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { trainerRoadIcalUrl: true },
  });
  if (!athlete?.trainerRoadIcalUrl) {
    return NextResponse.json({ error: "Save a TrainerRoad calendar URL first" }, { status: 400 });
  }

  try {
    const ics = await fetchTrainerRoadIcs(athlete.trainerRoadIcalUrl);
    const result = await createTrainerRoadSeason(athleteId, ics);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrainerRoadSeasonOverlapError) {
      return NextResponse.json(
        { error: error.message, overlapping: error.overlapping },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Could not create TrainerRoad season";
    const status = /calendar URL|phase markers/i.test(message) ? 400 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const season = await getLinkedTrainerRoadSeason(athleteId);
  return NextResponse.json({ season });
}
