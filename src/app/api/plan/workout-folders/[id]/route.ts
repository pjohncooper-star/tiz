import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateWorkoutFolderSchema } from "@/lib/plan/api-schemas";

type RouteContext = { params: Promise<{ id: string }> };

async function loadFolder(athleteId: string, id: string) {
  return db.workoutFolder.findFirst({
    where: { id, athleteId },
    include: {
      templates: { orderBy: { sortOrder: "asc" } },
      childFolders: { orderBy: { sortOrder: "asc" } },
      lastCompletedTemplate: { select: { id: true, name: true } },
      lastCompletedSession: { select: { id: true, title: true, scheduledDate: true } },
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const folder = await loadFolder(athleteId, id);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ folder });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.workoutFolder.findFirst({ where: { id, athleteId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateWorkoutFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.parentFolderId !== undefined) {
    const parentFolderId = parsed.data.parentFolderId;
    if (parentFolderId === id) {
      return NextResponse.json({ error: "Folder cannot be its own parent" }, { status: 400 });
    }
    if (parentFolderId) {
      const parent = await db.workoutFolder.findFirst({
        where: { id: parentFolderId, athleteId },
        select: { folderKind: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      if (parent.folderKind === "PROGRESSION") {
        return NextResponse.json(
          { error: "Cannot nest folders inside a progression folder" },
          { status: 400 }
        );
      }
    }
  }

  const folder = await db.workoutFolder.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.parentFolderId !== undefined
        ? { parentFolderId: parsed.data.parentFolderId }
        : {}),
      ...(parsed.data.discipline !== undefined ? { discipline: parsed.data.discipline } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
    include: {
      templates: { orderBy: { sortOrder: "asc" } },
      childFolders: { orderBy: { sortOrder: "asc" } },
      lastCompletedTemplate: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ folder });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await db.workoutFolder.findFirst({
    where: { id, athleteId },
    include: {
      _count: { select: { templates: true, childFolders: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing._count.templates > 0 || existing._count.childFolders > 0) {
    return NextResponse.json(
      { error: "Folder must be empty before deleting" },
      { status: 400 }
    );
  }

  await db.workoutFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
