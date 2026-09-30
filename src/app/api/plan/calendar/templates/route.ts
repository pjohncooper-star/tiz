import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createWeeklyTemplate,
  listWeeklyTemplates,
} from "@/lib/plan/calendar/template.server";
import { weeklyTemplateItemSchema } from "@/lib/plan/api-schemas";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(["DEFAULT", "PHASE", "REST", "TEST"]).optional(),
  items: z.array(weeklyTemplateItemSchema).optional(),
});

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await listWeeklyTemplates(athleteId);
  return NextResponse.json({ templates });
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await createWeeklyTemplate(athleteId, parsed.data);
  return NextResponse.json({ template }, { status: 201 });
}
