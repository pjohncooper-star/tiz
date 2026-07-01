import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyWorkoutPaletteSchema } from "@/lib/plan/api-schemas";
import {
  applyWorkoutPaletteToSession,
  ApplyWorkoutError,
} from "@/lib/workout/apply-workout-palette";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = applyWorkoutPaletteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await applyWorkoutPaletteToSession(
      athleteId,
      sessionId,
      parsed.data.palette
    );
    return NextResponse.json({ session: updated });
  } catch (e) {
    if (e instanceof ApplyWorkoutError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
