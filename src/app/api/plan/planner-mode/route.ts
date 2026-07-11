import { NextResponse } from "next/server";
import { requireAthlete } from "@/lib/auth/session";
import { isPlanBuilderEnabled } from "@/lib/features";

/** Authenticated debug: which planner flags the server sees (for prod troubleshooting). */
export async function GET() {
  await requireAthlete();

  return NextResponse.json({
    FEATURE_PLAN_BUILDER: process.env.FEATURE_PLAN_BUILDER ?? null,
    planBuilderEnabled: isPlanBuilderEnabled(),
    seasonPlanner: "unified",
  });
}
