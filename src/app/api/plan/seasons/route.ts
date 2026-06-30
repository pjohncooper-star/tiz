import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listSeasonPlansForAthlete,
} from "@/lib/plan/season/season-plan.server";
import { serializeSeasonSummary } from "@/lib/plan/season/serialize";

export async function GET() {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await listSeasonPlansForAthlete(athleteId);
  return NextResponse.json({
    seasons: plans.map((plan) =>
      serializeSeasonSummary({
        ...plan,
        weeks: plan.weeks,
      })
    ),
  });
}
