import { NextResponse } from "next/server";
import { z } from "zod";
import type { ComponentType, Discipline } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createWorkoutComponentSchema,
  planDisciplineSchema,
  componentTypeSchema,
} from "@/lib/plan/api-schemas";
import { serializeComponentSteps } from "@/lib/workout/apply-workout-palette";
import { defaultLeafStep, WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";

const listQuerySchema = z.object({
  discipline: planDisciplineSchema.optional(),
  componentType: componentTypeSchema.optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = listQuerySchema.safeParse({
    discipline: searchParams.get("discipline") ?? undefined,
    componentType: searchParams.get("componentType") ?? undefined,
  });

  const where: {
    athleteId: string;
    discipline?: Discipline;
    componentType?: ComponentType;
  } = { athleteId };

  if (query.success) {
    if (query.data.discipline) where.discipline = query.data.discipline;
    if (query.data.componentType) where.componentType = query.data.componentType;
  }

  const components = await db.workoutComponent.findMany({
    where,
    orderBy: [{ componentType: "asc" }, { name: "asc" }],
    include: {
      progressionSteps: { orderBy: { orderIndex: "asc" } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });

  return NextResponse.json({ components });
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

  const parsed = createWorkoutComponentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const steps =
    parsed.data.steps ??
    ({ version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] } as const);

  const component = await db.workoutComponent.create({
    data: {
      athleteId,
      name: parsed.data.name,
      discipline: parsed.data.discipline,
      componentType: parsed.data.componentType,
      notes: parsed.data.notes ?? null,
      steps: serializeComponentSteps(steps),
    },
    include: { progressionSteps: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json({ component }, { status: 201 });
}
