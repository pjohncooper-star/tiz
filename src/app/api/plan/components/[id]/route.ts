import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateWorkoutComponentSchema } from "@/lib/plan/api-schemas";
import { serializeComponentSteps } from "@/lib/workout/apply-workout-palette";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const component = await db.workoutComponent.findFirst({
    where: { id, athleteId },
    include: {
      progressionSteps: { orderBy: { orderIndex: "asc" } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });
  if (!component) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ component });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.workoutComponent.findFirst({ where: { id, athleteId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateWorkoutComponentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const component = await db.workoutComponent.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.discipline !== undefined ? { discipline: parsed.data.discipline } : {}),
      ...(parsed.data.componentType !== undefined
        ? { componentType: parsed.data.componentType }
        : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.steps !== undefined
        ? { steps: serializeComponentSteps(parsed.data.steps) }
        : {}),
    },
    include: {
      progressionSteps: { orderBy: { orderIndex: "asc" } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });

  return NextResponse.json({ component });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.workoutComponent.findFirst({ where: { id, athleteId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.workoutComponent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
