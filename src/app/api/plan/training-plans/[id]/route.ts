import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteTrainingPlan,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    await deleteTrainingPlan(athleteId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to delete plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
