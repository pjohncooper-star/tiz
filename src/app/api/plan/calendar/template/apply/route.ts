import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizeWeekStart } from "@/lib/dates";
import {
  applyWeeklyTemplate,
  weekHasPlannedSessions,
} from "@/lib/plan/calendar/template.server";

const applySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["clear_week", "clear_template_days", "merge"]),
});

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

  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const weekStart = normalizeWeekStart(parsed.data.weekStart);
    const result = await applyWeeklyTemplate(
      athleteId,
      weekStart,
      parsed.data.mode
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("applyWeeklyTemplate failed:", err);
    const message = err instanceof Error ? err.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart");
  if (!weekStartParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
    return NextResponse.json({ error: "weekStart required" }, { status: 400 });
  }

  const weekStart = normalizeWeekStart(weekStartParam);
  const hasSessions = await weekHasPlannedSessions(athleteId, weekStart);
  return NextResponse.json({ hasSessions });
}
