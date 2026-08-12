import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sessionRoleSchema, stepsPayloadSchema } from "@/lib/plan/api-schemas";
import {
  deleteTrainingPlanSession,
  updateTrainingPlanSession,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

const updateSessionSchema = z.object({
  dayOffset: z.number().int().min(0).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  discipline: z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"]).optional(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  sessionRole: sessionRoleSchema.optional(),
  estimatedDurationMinutes: z.number().positive().nullable().optional(),
  distanceMeters: z.number().positive().nullable().optional(),
  targetSpeedMps: z.number().positive().nullable().optional(),
  targetPaceSeconds: z.number().positive().nullable().optional(),
  poolSize: z.enum(["SCY", "SCM", "LCM"]).nullable().optional(),
  steps: stepsPayloadSchema.nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: planId, sessionId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const planSession = await updateTrainingPlanSession(
      athleteId,
      planId,
      sessionId,
      parsed.data
    );
    return NextResponse.json({ session: planSession });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to update session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: planId, sessionId } = await context.params;
  try {
    const aggregates = await deleteTrainingPlanSession(athleteId, planId, sessionId);
    return NextResponse.json({ ok: true, ...aggregates });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed to delete session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
