import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isSimpleSeasonPlannerEnabled } from "@/lib/features";
import { materializeSeasonTemplates } from "@/lib/plan/season/materialize-season.server";

const bodySchema = z
  .object({
    onlyEmptyWeeks: z.boolean().optional(),
  })
  .optional();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isSimpleSeasonPlannerEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown = undefined;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await materializeSeasonTemplates(athleteId, id, {
      onlyEmptyWeeks: parsed.data?.onlyEmptyWeeks ?? false,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not materialize templates";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
