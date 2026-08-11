import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  clearTrainingPlanFutureSessions,
  deleteTrainingPlan,
  getTrainingPlanDetail,
  renameTrainingPlan,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

const renameBodySchema = z.object({
  name: z.string().min(1).max(120),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const plan = await getTrainingPlanDetail(athleteId, id);
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to load plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = renameBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const plan = await renameTrainingPlan(athleteId, id, parsed.data.name);
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to rename plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const clearFuture = searchParams.get("clearFuture") === "1";

  try {
    if (clearFuture) {
      const result = await clearTrainingPlanFutureSessions(athleteId, id);
      return NextResponse.json({ ok: true, ...result });
    }
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
