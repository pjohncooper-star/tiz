import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getOrCreateScopedTemplate,
  replaceScopedTemplate,
  resolveTemplateScope,
} from "@/lib/plan/calendar/template.server";
import {
  templateScopeFromParams,
  templateScopeSchema,
} from "@/lib/plan/calendar/template-scope";

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
  scope: templateScopeSchema.optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  let scopeInput;
  try {
    scopeInput = templateScopeFromParams({
      kind: url.searchParams.get("kind"),
      seasonPlanId: url.searchParams.get("seasonPlanId"),
      seasonPhaseId: url.searchParams.get("seasonPhaseId"),
    });
  } catch {
    return NextResponse.json({ error: "Invalid template scope" }, { status: 400 });
  }

  try {
    const scope = await resolveTemplateScope(athleteId, scopeInput);
    const template = await getOrCreateScopedTemplate(scope);
    return NextResponse.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
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

  try {
    const scope = await resolveTemplateScope(
      athleteId,
      parsed.data.scope ?? { kind: "DEFAULT" }
    );
    const template = await replaceScopedTemplate(
      scope,
      parsed.data.name ?? "Weekly template",
      parsed.data.items
    );
    return NextResponse.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
