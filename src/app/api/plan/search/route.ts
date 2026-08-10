import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTrainingHistory } from "@/lib/plan/search.server";

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const { results, nextCursor } = await searchTrainingHistory(athleteId, {
    q: url.searchParams.get("q"),
    discipline: url.searchParams.get("discipline"),
    minDistanceMeters: url.searchParams.get("minDistanceMeters"),
    maxDistanceMeters: url.searchParams.get("maxDistanceMeters"),
    minDurationMinutes: url.searchParams.get("minDurationMinutes"),
    maxDurationMinutes: url.searchParams.get("maxDurationMinutes"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    tags: url.searchParams.get("tags"),
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
  });

  return NextResponse.json({ results, nextCursor });
}
