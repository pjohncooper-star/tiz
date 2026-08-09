import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
    : 20;

  const tags = await db.athleteWorkoutTag.findMany({
    where: {
      athleteId,
      ...(q ? { name: { startsWith: q } } : {}),
    },
    orderBy: { name: "asc" },
    take: limit,
    select: { name: true, label: true },
  });

  return NextResponse.json({ tags });
}
