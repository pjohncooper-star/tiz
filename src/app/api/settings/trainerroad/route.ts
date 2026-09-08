import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  disconnectTrainerRoad,
  fetchTrainerRoadIcs,
  syncTrainerRoadCalendar,
} from "@/lib/plan/trainerroad/sync";
import { listTrainerRoadDrivenSeasons } from "@/lib/plan/trainerroad/season.server";
import { parseTrainerRoadCalendar } from "@/lib/plan/trainerroad/calendar";
import { trainerRoadCalendarToSeasonDraft } from "@/lib/plan/trainerroad/season";
import { normalizeTrainerRoadIcalUrl } from "@/lib/plan/trainerroad/url";

const saveSchema = z.object({
  url: z.string().max(2000),
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { trainerRoadIcalUrl: true, trainerRoadSyncedAt: true },
    });
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    let previewPhases: Array<{
      name: string;
      color: string;
      startWeekIndex: number;
      endWeekIndex: number;
    }> | null = null;
    if (
      athlete?.trainerRoadIcalUrl &&
      startDate &&
      endDate &&
      DATE_KEY.test(startDate) &&
      DATE_KEY.test(endDate)
    ) {
      try {
        const ics = await fetchTrainerRoadIcs(athlete.trainerRoadIcalUrl);
        const calendar = parseTrainerRoadCalendar(ics);
        const draft = trainerRoadCalendarToSeasonDraft(calendar, {
          startDateKey: startDate,
          endDateKey: endDate,
        });
        previewPhases = (draft?.phases ?? []).map((phase) => ({
          name: phase.name,
          color: phase.color,
          startWeekIndex: phase.startWeekIndex,
          endWeekIndex: phase.endWeekIndex,
        }));
      } catch {
        previewPhases = [];
      }
    }
    return NextResponse.json({
      url: athlete?.trainerRoadIcalUrl ?? null,
      syncedAt: athlete?.trainerRoadSyncedAt?.toISOString() ?? null,
      seasons: await listTrainerRoadDrivenSeasons(athleteId),
      previewPhases,
    });
  } catch (error) {
    if (error instanceof Error && /trainerRoadIcalUrl|column/i.test(error.message)) {
      return NextResponse.json({ url: null, syncedAt: null, seasons: [], previewPhases: null });
    }
    throw error;
  }
}

export async function PUT(request: Request) {
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

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a TrainerRoad calendar URL" }, { status: 400 });
  }

  const trimmed = parsed.data.url.trim();
  if (!trimmed) {
    await disconnectTrainerRoad(athleteId);
    return NextResponse.json({ url: null, syncedAt: null, seasons: [] });
  }

  const url = normalizeTrainerRoadIcalUrl(trimmed);
  if (!url) {
    return NextResponse.json(
      { error: "Use your TrainerRoad calendar URL (webcal or https)." },
      { status: 400 }
    );
  }

  await db.athlete.update({
    where: { id: athleteId },
    data: { trainerRoadIcalUrl: url },
  });

  try {
    const ics = await fetchTrainerRoadIcs(url);
    const result = await syncTrainerRoadCalendar(athleteId, ics);
    return NextResponse.json({ url, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch calendar";
    return NextResponse.json({ url, error: message, syncedAt: null }, { status: 422 });
  }
}

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
    const result = await syncTrainerRoadCalendar(athleteId, ics);
    return NextResponse.json({ url: athlete.trainerRoadIcalUrl, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch calendar";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
