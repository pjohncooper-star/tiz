import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  createTrainingPlanFromCsv,
  listTrainingPlans,
  TrainingPlanError,
} from "@/lib/plan/training-plan.server";

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await listTrainingPlans(athleteId);
  return NextResponse.json({ plans });
}

const createMetaSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  confirmLargeGaps: z
    .union([z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0")])
    .optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file selected" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });
  }

  const meta = createMetaSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") || null,
    confirmLargeGaps: form.get("confirmLargeGaps") || undefined,
  });
  if (!meta.success) {
    return NextResponse.json({ error: "Program name is required" }, { status: 400 });
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "Could not read file" }, { status: 400 });
  }

  const confirmLargeGaps =
    meta.data.confirmLargeGaps === "true" || meta.data.confirmLargeGaps === "1";

  try {
    const plan = await createTrainingPlanFromCsv(athleteId, {
      name: meta.data.name,
      description: meta.data.description,
      csvText: text,
      confirmLargeGaps,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e) {
    if (e instanceof TrainingPlanError) {
      return NextResponse.json(
        { error: e.message, errors: e.errors, code: e.code },
        { status: e.status }
      );
    }
    const message = e instanceof Error ? e.message : "Failed to create plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
