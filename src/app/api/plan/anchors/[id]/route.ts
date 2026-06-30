import { NextResponse } from "next/server";
import { parseISO, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anchorWorkoutWithSeasonSchema } from "@/lib/plan/api-schemas";
import { parseWorkoutTree, serializeWorkoutTree } from "@/lib/workout/steps";

function stepsForDb(steps: unknown | undefined): Prisma.InputJsonValue | undefined {
  if (steps === undefined) return undefined;
  return serializeWorkoutTree(parseWorkoutTree(steps)) as Prisma.InputJsonValue;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.anchorWorkout.findFirst({ where: { id, athleteId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = anchorWorkoutWithSeasonSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  await db.anchorWorkout.update({
    where: { id },
    data: {
      title: data.title,
      discipline: data.discipline,
      weekday: data.weekday,
      durationMinutes: data.durationMinutes,
      distanceMeters: data.distanceMeters,
      targetSpeedMps: data.targetSpeedMps,
      targetPaceSeconds: data.targetPaceSeconds,
      targetZones: data.targetZones ?? undefined,
      steps: data.steps !== undefined ? stepsForDb(data.steps) : undefined,
      effectiveFrom: data.effectiveFrom
        ? startOfDay(parseISO(data.effectiveFrom))
        : undefined,
      effectiveUntil:
        data.effectiveUntil === null
          ? null
          : data.effectiveUntil
            ? startOfDay(parseISO(data.effectiveUntil))
            : undefined,
      respectTaper: data.respectTaper,
      notes: data.notes,
      workoutTemplateId: data.workoutTemplateId,
      seasonPlanId: data.seasonPlanId,
      seasonPhaseId: data.seasonPhaseId,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.anchorWorkout.findFirst({ where: { id, athleteId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.anchorWorkout.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
