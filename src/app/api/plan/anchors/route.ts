import { NextResponse } from "next/server";
import { format, parseISO, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { anchorWorkoutWithSeasonSchema } from "@/lib/plan/api-schemas";
import { parseWorkoutTree, serializeWorkoutTree } from "@/lib/workout/steps";

function stepsForDb(steps: unknown | undefined): Prisma.InputJsonValue | undefined {
  if (steps === undefined) return undefined;
  return serializeWorkoutTree(parseWorkoutTree(steps)) as Prisma.InputJsonValue;
}

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const seasonPlanId = searchParams.get("seasonPlanId");

  const anchors = await db.anchorWorkout.findMany({
    where: {
      athleteId,
      ...(seasonPlanId ? { seasonPlanId } : {}),
    },
    orderBy: [{ weekday: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({
    anchors: anchors.map((a) => ({
      id: a.id,
      title: a.title,
      discipline: a.discipline,
      weekday: a.weekday,
      durationMinutes: a.durationMinutes,
      effectiveFrom: format(a.effectiveFrom, "yyyy-MM-dd"),
      effectiveUntil: a.effectiveUntil ? format(a.effectiveUntil, "yyyy-MM-dd") : null,
      respectTaper: a.respectTaper,
      workoutTemplateId: a.workoutTemplateId,
      seasonPlanId: a.seasonPlanId,
      seasonPhaseId: a.seasonPhaseId,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = anchorWorkoutWithSeasonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const anchor = await db.anchorWorkout.create({
    data: {
      id: cuid(),
      athleteId,
      workoutTemplateId: data.workoutTemplateId ?? null,
      title: data.title,
      discipline: data.discipline,
      weekday: data.weekday,
      durationMinutes: data.durationMinutes ?? null,
      distanceMeters: data.distanceMeters ?? null,
      targetSpeedMps: data.targetSpeedMps ?? null,
      targetPaceSeconds: data.targetPaceSeconds ?? null,
      targetZones: data.targetZones ?? undefined,
      steps: stepsForDb(data.steps),
      effectiveFrom: startOfDay(parseISO(data.effectiveFrom)),
      effectiveUntil: data.effectiveUntil
        ? startOfDay(parseISO(data.effectiveUntil))
        : null,
      respectTaper: data.respectTaper ?? true,
      notes: data.notes ?? null,
      seasonPlanId: data.seasonPlanId ?? null,
      seasonPhaseId: data.seasonPhaseId ?? null,
    },
  });

  return NextResponse.json({ anchor: { id: anchor.id } });
}
