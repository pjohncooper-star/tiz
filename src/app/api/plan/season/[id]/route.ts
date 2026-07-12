import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { archiveSeasonPlan } from "@/lib/plan/season/season-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await archiveSeasonPlan(athleteId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not archive season";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
