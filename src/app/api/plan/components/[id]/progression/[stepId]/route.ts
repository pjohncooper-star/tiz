import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProgressionStepSchema } from "@/lib/plan/api-schemas";
import { serializeComponentSteps } from "@/lib/workout/apply-workout-palette";

type RouteContext = { params: Promise<{ id: string; stepId: string }> };

async function loadStep(athleteId: string, componentId: string, stepId: string) {
  return db.componentProgressionStep.findFirst({
    where: {
      id: stepId,
      componentId,
      component: { athleteId },
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: componentId, stepId } = await context.params;
  const existing = await loadStep(athleteId, componentId, stepId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateProgressionStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const step = await db.componentProgressionStep.update({
    where: { id: stepId },
    data: {
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.orderIndex !== undefined ? { orderIndex: parsed.data.orderIndex } : {}),
      ...(parsed.data.steps !== undefined
        ? { steps: serializeComponentSteps(parsed.data.steps) }
        : {}),
    },
  });

  return NextResponse.json({ step });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: componentId, stepId } = await context.params;
  const existing = await loadStep(athleteId, componentId, stepId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.componentProgressionStep.delete({ where: { id: stepId } });
  return NextResponse.json({ ok: true });
}
