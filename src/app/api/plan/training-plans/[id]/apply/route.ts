import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  applyTrainingPlan,
  previewTrainingPlanApply,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

type RouteContext = { params: Promise<{ id: string }> };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const previewQuerySchema = z.object({
  anchorMode: z.enum(["start", "end"]),
  date: z.string().regex(DATE_KEY),
});

const applyBodySchema = z.object({
  anchorMode: z.enum(["start", "end"]),
  date: z.string().regex(DATE_KEY),
  mode: z.enum(["merge", "replace"]),
});

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const parsed = previewQuerySchema.safeParse({
    anchorMode: searchParams.get("anchorMode"),
    date: searchParams.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "anchorMode and date (yyyy-MM-dd) are required" },
      { status: 400 }
    );
  }

  try {
    const preview = await previewTrainingPlanApply(athleteId, id, parsed.data);
    return NextResponse.json({ preview });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = applyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await applyTrainingPlan(athleteId, id, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
