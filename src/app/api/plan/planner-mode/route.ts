import { NextResponse } from "next/server";
import { requireAthlete } from "@/lib/auth/session";
import {
  isPlanBuilderEnabled,
  isPlanningCalendarEnabled,
  isSimpleSeasonPlannerEnabled,
} from "@/lib/features";

/** Authenticated debug: which planner flags the server sees (for prod troubleshooting). */
export async function GET() {
  await requireAthlete();

  return NextResponse.json({
    FEATURE_PLAN_BUILDER: process.env.FEATURE_PLAN_BUILDER ?? null,
    FEATURE_SIMPLE_SEASON_PLANNER: process.env.FEATURE_SIMPLE_SEASON_PLANNER ?? null,
    FEATURE_PLANNING_CALENDAR: process.env.FEATURE_PLANNING_CALENDAR ?? null,
    planBuilderEnabled: isPlanBuilderEnabled(),
    simpleSeasonPlannerEnabled: isSimpleSeasonPlannerEnabled(),
    planningCalendarEnabled: isPlanningCalendarEnabled(),
  });
}
