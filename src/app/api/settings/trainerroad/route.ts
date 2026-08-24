import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  disconnectTrainerRoad,
  fetchTrainerRoadIcs,
  syncTrainerRoadCalendar,
} from "@/lib/plan/trainerroad/sync";
import { normalizeTrainerRoadIcalUrl } from "@/lib/plan/trainerroad/url";

const saveSchema = z.object({
  url: z.string().max(2000),
});

export async function GET() {
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
    return NextResponse.json({
      url: athlete?.trainerRoadIcalUrl ?? null,
      syncedAt: athlete?.trainerRoadSyncedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && /trainerRoadIcalUrl|column/i.test(error.message)) {
      return NextResponse.json({ url: null, syncedAt: null });
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
    return NextResponse.json({ url: null, syncedAt: null });
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
