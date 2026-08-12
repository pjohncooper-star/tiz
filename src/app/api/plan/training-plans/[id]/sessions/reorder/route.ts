import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  reorderTrainingPlanSessions,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

const reorderSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().min(1),
        dayOffset: z.number().int().min(0).max(200),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: planId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const plan = await reorderTrainingPlanSessions(
      athleteId,
      planId,
      parsed.data.order
    );
    return NextResponse.json({ plan });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to reorder sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
