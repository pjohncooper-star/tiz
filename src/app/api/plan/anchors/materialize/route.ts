import { NextResponse } from "next/server";
import { parseISO, startOfDay } from "date-fns";
import { auth } from "@/lib/auth";
import { materializeAnchorsForWeek } from "@/lib/plan/anchor-workouts.server";
import { materializeWeekSchema } from "@/lib/plan/api-schemas";

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

  const parsed = materializeWeekSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await materializeAnchorsForWeek(athleteId, startOfDay(parseISO(parsed.data.weekStart)));
  return NextResponse.json({ ok: true });
}
