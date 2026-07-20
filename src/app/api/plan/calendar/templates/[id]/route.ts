import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  deleteWeeklyTemplate,
  getWeeklyTemplate,
  updateWeeklyTemplate,
} from "@/lib/plan/calendar/template.server";

const templateItemSchema = z.object({
  weekday: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  discipline: z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"]),
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().positive().nullable().optional(),
  distanceMeters: z.number().positive().nullable().optional(),
  poolSize: z.enum(["SCY", "SCM", "LCM"]).nullable().optional(),
  sessionRole: z.enum(["EASY", "MODERATE", "INTENSITY", "LONG"]).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const putSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.enum(["DEFAULT", "PHASE", "REST", "TEST"]).optional(),
  items: z.array(templateItemSchema),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const template = await getWeeklyTemplate(athleteId, id);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PUT(request: Request, context: RouteContext) {
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

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const template = await updateWeeklyTemplate(athleteId, id, parsed.data);
    return NextResponse.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    await deleteWeeklyTemplate(athleteId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
