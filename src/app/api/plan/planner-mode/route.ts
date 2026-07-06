import { NextResponse } from "next/server";
import { requireAthlete } from "@/lib/auth/session";
import {
  isAdvancedSeasonPlannerEnabled,
  isPlanBuilderEnabled,
  isSimpleSeasonPlannerEnabled,
} from "@/lib/features";

/** Authenticated debug: which planner flags the server sees (for prod troubleshooting). */
export async function GET() {
  await requireAthlete();

  return NextResponse.json({
    FEATURE_PLAN_BUILDER: process.env.FEATURE_PLAN_BUILDER ?? null,
    FEATURE_SIMPLE_SEASON_PLANNER: process.env.FEATURE_SIMPLE_SEASON_PLANNER ?? null,
    FEATURE_ADVANCED_SEASON_PLANNER: process.env.FEATURE_ADVANCED_SEASON_PLANNER ?? null,
    planBuilderEnabled: isPlanBuilderEnabled(),
    simpleSeasonPlannerEnabled: isSimpleSeasonPlannerEnabled(),
    advancedSeasonPlannerEnabled: isAdvancedSeasonPlannerEnabled(),
  });
}
