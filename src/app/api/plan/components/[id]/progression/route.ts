import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createProgressionStepSchema,
  updateProgressionStepSchema,
} from "@/lib/plan/api-schemas";
import { serializeComponentSteps } from "@/lib/workout/apply-workout-palette";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: componentId } = await context.params;
  const component = await db.workoutComponent.findFirst({
    where: { id: componentId, athleteId },
    select: { id: true },
  });
  if (!component) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const steps = await db.componentProgressionStep.findMany({
    where: { componentId },
    orderBy: { orderIndex: "asc" },
  });

  return NextResponse.json({ steps });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: componentId } = await context.params;
  const component = await db.workoutComponent.findFirst({
    where: { id: componentId, athleteId },
    select: { id: true },
  });
  if (!component) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createProgressionStepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const maxIndex = await db.componentProgressionStep.aggregate({
    where: { componentId },
    _max: { orderIndex: true },
  });
  const orderIndex =
    parsed.data.orderIndex ?? (maxIndex._max.orderIndex ?? -1) + 1;

  const step = await db.componentProgressionStep.create({
    data: {
      componentId,
      orderIndex,
      label: parsed.data.label,
      steps: serializeComponentSteps(parsed.data.steps),
    },
  });

  return NextResponse.json({ step }, { status: 201 });
}
