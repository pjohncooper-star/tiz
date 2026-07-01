import { NextResponse } from "next/server";
import { z } from "zod";
import type { Discipline } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createWorkoutFolderSchema,
  planDisciplineSchema,
} from "@/lib/plan/api-schemas";
import { loadFolderTree, nextSortOrder } from "@/lib/workout/workout-folder-library";

const listQuerySchema = z.object({
  tree: z.enum(["1", "true"]).optional(),
  discipline: planDisciplineSchema.optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = listQuerySchema.safeParse({
    tree: searchParams.get("tree") ?? undefined,
    discipline: searchParams.get("discipline") ?? undefined,
  });

  if (query.success && query.data.tree) {
    const tree = await loadFolderTree(
      db,
      athleteId,
      query.data.discipline as Discipline | undefined
    );
    return NextResponse.json({ tree });
  }

  const folders = await db.workoutFolder.findMany({
    where: { athleteId },
    orderBy: [{ parentFolderId: "asc" }, { sortOrder: "asc" }],
    include: {
      lastCompletedTemplate: { select: { id: true, name: true } },
      _count: { select: { templates: true, childFolders: true } },
    },
  });

  return NextResponse.json({ folders });
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

  const parsed = createWorkoutFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const parentFolderId = parsed.data.parentFolderId ?? null;
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

  const sortOrder =
    parsed.data.sortOrder ??
    (await nextSortOrder(db, athleteId, parentFolderId, "folder"));

  const folder = await db.workoutFolder.create({
    data: {
      athleteId,
      name: parsed.data.name,
      parentFolderId,
      folderKind: parsed.data.folderKind ?? "LIBRARY",
      discipline: parsed.data.discipline ?? null,
      sortOrder,
    },
    include: {
      lastCompletedTemplate: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ folder }, { status: 201 });
}
