import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (
    searchParams.get("hub.mode") === "subscribe" &&
    searchParams.get("hub.verify_token") === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
  ) {
    return NextResponse.json({ "hub.challenge": searchParams.get("hub.challenge") });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.object_type === "activity" && body.aspect_type === "create") {
    const conn = await db.stravaConnection.findFirst({
      where: { stravaAthleteId: BigInt(body.owner_id) },
    });
    if (conn) {
      await inngest.send({
        name: "strava/activity.sync",
        data: { athleteId: conn.athleteId, stravaActivityId: body.object_id },
      });
    }
  }
  return NextResponse.json({ received: true });
}
