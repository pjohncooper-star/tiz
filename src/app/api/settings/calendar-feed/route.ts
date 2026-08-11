import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const bodySchema = z.object({
  action: z.enum(["ensure", "rotate", "revoke"]),
});

function newFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { calendarFeedToken: true },
  });

  return NextResponse.json({
    hasToken: !!athlete?.calendarFeedToken,
    token: athlete?.calendarFeedToken ?? null,
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "revoke") {
    await db.athlete.update({
      where: { id: athleteId },
      data: { calendarFeedToken: null },
    });
    return NextResponse.json({ hasToken: false, token: null });
  }

  if (parsed.data.action === "ensure") {
    const existing = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { calendarFeedToken: true },
    });
    if (existing?.calendarFeedToken) {
      return NextResponse.json({
        hasToken: true,
        token: existing.calendarFeedToken,
      });
    }
  }

  const token = newFeedToken();
  await db.athlete.update({
    where: { id: athleteId },
    data: { calendarFeedToken: token },
  });
  return NextResponse.json({ hasToken: true, token });
}
