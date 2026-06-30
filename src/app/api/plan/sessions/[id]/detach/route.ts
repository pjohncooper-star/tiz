import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detachSessionFromAnchor } from "@/lib/plan/anchor-workouts.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await detachSessionFromAnchor(id, athleteId);
  return NextResponse.json({ ok: true, source: "FLEXIBLE" });
}
