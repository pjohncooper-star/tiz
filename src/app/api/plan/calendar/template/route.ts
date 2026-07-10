import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getOrCreateWeeklyTemplate,
  replaceWeeklyTemplate,
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
  items: z.array(templateItemSchema),
});

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const template = await getOrCreateWeeklyTemplate(athleteId);
  return NextResponse.json({ template });
}

export async function PUT(request: Request) {
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

  const template = await replaceWeeklyTemplate(
    athleteId,
    parsed.data.name ?? "Weekly template",
    parsed.data.items
  );
  return NextResponse.json({ template });
}
