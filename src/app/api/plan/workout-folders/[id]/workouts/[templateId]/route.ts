import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFolderWorkoutSchema } from "@/lib/plan/api-schemas";
import { serializeTemplateSteps } from "@/lib/workout/workout-folder-library";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

async function loadWorkout(athleteId: string, folderId: string, templateId: string) {
  return db.workoutTemplate.findFirst({
    where: { id: templateId, athleteId, folderId },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId, templateId } = await context.params;
  const workout = await loadWorkout(athleteId, folderId, templateId);
  if (!workout) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ workout });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId, templateId } = await context.params;
  const existing = await loadWorkout(athleteId, folderId, templateId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateFolderWorkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.folderId !== undefined && parsed.data.folderId !== folderId) {
    const destId = parsed.data.folderId;
    if (destId) {
      const dest = await db.workoutFolder.findFirst({
        where: { id: destId, athleteId },
        select: { id: true },
      });
      if (!dest) {
        return NextResponse.json({ error: "Destination folder not found" }, { status: 404 });
      }
    }
  }

  const workout = await db.workoutTemplate.update({
    where: { id: templateId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.discipline !== undefined ? { discipline: parsed.data.discipline } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId } : {}),
      ...(parsed.data.steps !== undefined
        ? { steps: serializeTemplateSteps(parsed.data.steps) }
        : {}),
    },
  });

  return NextResponse.json({ workout });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId, templateId } = await context.params;
  const existing = await loadWorkout(athleteId, folderId, templateId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.workoutTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ ok: true });
}
