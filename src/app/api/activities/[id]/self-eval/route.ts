import { NextResponse } from "next/server";
import type { DayQualityFlag } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayQualityFromFitSelfEval } from "@/lib/survey/fit-self-eval";
import {
  buildSurveyUpdateFromValues,
  parseSelfEvalConfig,
  type SelfEvalConfig,
  type SurveyUpdateData,
} from "@/lib/survey/self-eval-config";

type RouteContext = { params: Promise<{ id: string }> };
function surveyFieldsForDb(
  data: SurveyUpdateData & { dayQualityFlag: DayQualityFlag | null }
) {
  const { customFields, ...rest } = data;
  return {
    ...rest,
    customFields:
      customFields === undefined
        ? undefined
        : customFields === null
          ? Prisma.DbNull
          : (customFields as Prisma.InputJsonValue),
  };
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: activityId } = await context.params;
  const activity = await db.syncedActivity.findFirst({
    where: { id: activityId, athleteId },
    select: { id: true },
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { selfEvalConfig: true },
  });
  const config: SelfEvalConfig = parseSelfEvalConfig(athlete?.selfEvalConfig);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const enabledIds = new Set(config.fields.map((field) => field.id));
  for (const key of Object.keys(values)) {
    if (!enabledIds.has(key)) {
      return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
    }
  }

  let update;
  try {
    update = buildSurveyUpdateFromValues(values, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid field values";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await db.surveyResponse.findUnique({ where: { activityId } });
  const mergedFreshness = update.freshness !== undefined ? update.freshness : existing?.freshness ?? null;
  const mergedRpe = update.rpe !== undefined ? update.rpe : existing?.rpe ?? null;
  const dayQualityFlag = dayQualityFromFitSelfEval(mergedFreshness, mergedRpe);

  const data = surveyFieldsForDb({
    ...update,
    dayQualityFlag,
  });

  const survey = existing
    ? await db.surveyResponse.update({
        where: { activityId },
        data: {
          ...data,
          source: existing.source === "FIT_IMPORT" ? "FIT_IMPORT" : existing.source,
        },
      })
    : await db.surveyResponse.create({
        data: {
          athleteId,
          activityId,
          source: "MANUAL",
          ...data,
        },
      });

  return NextResponse.json({ survey });
}




