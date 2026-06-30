import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  linkActivityToPlannedSession,
  SessionLinkError,
  unlinkPlannedSessionActivity,
} from "@/lib/plan/session-link";

const linkSchema = z.object({
  activityId: z.string().min(1),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await linkActivityToPlannedSession(
      athleteId,
      sessionId,
      parsed.data.activityId
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SessionLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;

  try {
    const result = await unlinkPlannedSessionActivity(athleteId, sessionId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SessionLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
