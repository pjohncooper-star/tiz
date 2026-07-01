import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createFolderWorkoutSchema,
  reorderFolderWorkoutsSchema,
} from "@/lib/plan/api-schemas";
import {
  nextSortOrder,
  serializeTemplateSteps,
} from "@/lib/workout/workout-folder-library";
import { defaultLeafStep, WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";

type RouteContext = { params: Promise<{ id: string }> };

async function loadFolder(athleteId: string, folderId: string) {
  return db.workoutFolder.findFirst({
    where: { id: folderId, athleteId },
    select: { id: true, folderKind: true },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId } = await context.params;
  const folder = await loadFolder(athleteId, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const workouts = await db.workoutTemplate.findMany({
    where: { athleteId, folderId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ workouts });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId } = await context.params;
  const folder = await loadFolder(athleteId, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body && typeof body === "object" && "orderedIds" in body) {
    const parsed = reorderFolderWorkoutsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await db.$transaction(
      parsed.data.orderedIds.map((templateId, index) =>
        db.workoutTemplate.updateMany({
          where: { id: templateId, athleteId, folderId },
          data: { sortOrder: index },
        })
      )
    );
    const workouts = await db.workoutTemplate.findMany({
      where: { athleteId, folderId },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ workouts });
  }

  const parsed = createFolderWorkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const steps =
    parsed.data.steps ??
    ({ version: WORKOUT_TREE_VERSION, nodes: [defaultLeafStep()] } as const);

  const sortOrder =
    parsed.data.sortOrder ??
    (await nextSortOrder(db, athleteId, null, "workout", folderId));

  const workout = await db.workoutTemplate.create({
    data: {
      athleteId,
      folderId,
      name: parsed.data.name,
      discipline: parsed.data.discipline,
      steps: serializeTemplateSteps(steps),
      sortOrder,
    },
  });

  return NextResponse.json({ workout }, { status: 201 });
}
