import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  DEFAULT_INSIGHT_SENSITIVITY,
  isInsightSensitivity,
  type InsightSensitivity,
} from "@/lib/signaling/sensitivity";
import {
  DEFAULT_LOOKBACK_WINDOW_HOURS,
  isLookbackWindowHours,
  type LookbackWindowHours,
} from "@/lib/signaling/lookback-window";
import { regenerateV0Insights } from "@/lib/signaling/v0";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = z
      .object({
        sensitivity: z.string().optional(),
        lookbackHours: z.number().optional(),
      })
      .parse(await req.json().catch(() => ({})));

    const sensitivity: InsightSensitivity =
      body.sensitivity && isInsightSensitivity(body.sensitivity)
        ? body.sensitivity
        : DEFAULT_INSIGHT_SENSITIVITY;

    const lookbackHours: LookbackWindowHours =
      body.lookbackHours != null && isLookbackWindowHours(body.lookbackHours)
        ? body.lookbackHours
        : DEFAULT_LOOKBACK_WINDOW_HOURS;

    const result = await regenerateV0Insights(session.user.athleteId, {
      sensitivity,
      lookbackHours,
    });
    return NextResponse.json({
      count: result.insights.length,
      riskCount: result.riskCount,
      protectiveCount: result.protectiveCount,
      gateActivated: result.gateActivated,
      goodCount: result.goodCount,
      badCount: result.badCount,
      sensitivity: result.sensitivity,
      lookbackHours: result.lookbackHours,
      message: result.message,
      insights: result.insights,
    });
  } catch (e) {
    console.error("[insights] regenerate failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not regenerate insights" },
      { status: 500 }
    );
  }
}
