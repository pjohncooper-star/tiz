import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createTrainingPlanFromCalendar,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.string().regex(DATE_KEY),
  endDate: z.string().regex(DATE_KEY),
  disciplines: z.array(z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"])).optional(),
  confirmLargeGaps: z.boolean().optional(),
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const plan = await createTrainingPlanFromCalendar(athleteId, parsed.data);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status }
      );
    }
    const message = e instanceof Error ? e.message : "Failed to create plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
