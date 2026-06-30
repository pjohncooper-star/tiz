import { NextResponse } from "next/server";
import { z } from "zod";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { setOnboardingStep } from "@/lib/onboarding";
import { recordedActivityWhere } from "@/lib/import/classify";
import { formatWorkoutFeelLabel } from "@/lib/survey/fit-self-eval";
import type { DayQualityFlag } from "@prisma/client";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const FLAG_BATCH_SIZE = 25;

type FlagInput = {
  activityId: string;
  dayQualityFlag: DayQualityFlag | null;
};

async function processFlagBatch(athleteId: string, flags: FlagInput[]) {
  for (let i = 0; i < flags.length; i += FLAG_BATCH_SIZE) {
    const chunk = flags.slice(i, i + FLAG_BATCH_SIZE);
    await Promise.all(chunk.map((f) => processFlag(athleteId, f)));
  }
}

async function processFlag(athleteId: string, f: FlagInput) {
  if (!f.dayQualityFlag) {
    const existing = await db.surveyResponse.findFirst({
      where: { activityId: f.activityId, athleteId },
    });
    if (
      existing?.source === "FIT_IMPORT" &&
      (existing.freshness != null || existing.rpe != null)
    ) {
      if (existing.dayQualityFlag == null) return;
      await db.surveyResponse.update({
        where: { activityId: f.activityId },
        data: { dayQualityFlag: null },
      });
      return;
    }
    await db.surveyResponse.deleteMany({
      where: { activityId: f.activityId, athleteId },
    });
    return;
  }

  const existing = await db.surveyResponse.findUnique({
    where: { activityId: f.activityId },
  });
  if (existing?.dayQualityFlag === f.dayQualityFlag) return;

  await db.surveyResponse.upsert({
    where: { activityId: f.activityId },
    create: {
      athleteId,
      activityId: f.activityId,
      dayQualityFlag: f.dayQualityFlag,
      source: "HISTORICAL_BACKFILL",
    },
    update: {
      dayQualityFlag: f.dayQualityFlag,
      source:
        existing?.source === "FIT_IMPORT" ? "FIT_IMPORT" : "HISTORICAL_BACKFILL",
    },
  });
}

function scheduleSignalingGeneration(athleteId: string) {
  void inngest
    .send({
      name: "signaling/v0.generate",
      data: { athleteId },
    })
    .catch((err) => {
      console.error("[day-flags] signaling enqueue failed:", err);
    });
}

function localDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const athleteId = session.user.athleteId;
  const dateParam = new URL(req.url).searchParams.get("date");

  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { onboardingStep: true },
  });

  const allActivities = await db.syncedActivity.findMany({
    where: { athleteId, ...recordedActivityWhere },
    select: {
      id: true,
      startTime: true,
      surveyResponse: { select: { dayQualityFlag: true } },
    },
    orderBy: { startTime: "desc" },
  });

  const allDateKeys = allActivities.map((a) => localDateKey(a.startTime));
  const dates = [...new Set(allDateKeys)].sort((a, b) => b.localeCompare(a));
  const dateRange = {
    min: allDateKeys[allDateKeys.length - 1] ?? null,
    max: allDateKeys[0] ?? null,
  };

  const unflaggedDates = [
    ...new Set(
      allActivities
        .filter((a) => !a.surveyResponse?.dayQualityFlag)
        .map((a) => localDateKey(a.startTime))
    ),
  ].sort((a, b) => b.localeCompare(a));

  const totalUnflagged = allActivities.filter(
    (a) => !a.surveyResponse?.dayQualityFlag
  ).length;

  const savedFlags = allActivities
    .filter((a) => a.surveyResponse?.dayQualityFlag)
    .map((a) => ({
      activityId: a.id,
      dayQualityFlag: a.surveyResponse!.dayQualityFlag!,
      startTime: a.startTime.toISOString(),
    }));

  const selectedDate =
    dateParam && DATE_KEY.test(dateParam)
      ? dateParam
      : unflaggedDates[0] ?? dates[0] ?? null;

  const dayWhere: { gte: Date; lte: Date } | undefined = selectedDate
    ? {
        gte: startOfDay(parseISO(selectedDate)),
        lte: endOfDay(parseISO(selectedDate)),
      }
    : undefined;

  const candidates = await db.syncedActivity.findMany({
    where: {
      athleteId,
      ...recordedActivityWhere,
      ...(dayWhere ? { startTime: dayWhere } : {}),
    },
    orderBy: [{ isPrOrAchievement: "desc" }, { startTime: "desc" }],
    include: {
      surveyResponse: {
        select: {
          dayQualityFlag: true,
          freshness: true,
          rpe: true,
          source: true,
        },
      },
    },
  });

  return NextResponse.json({
    candidates: candidates.map((c) => {
      const survey = c.surveyResponse;
      const feel = survey?.freshness ?? null;
      return {
        id: c.id,
        name: c.name,
        startTime: c.startTime.toISOString(),
        discipline: c.discipline,
        isPrOrAchievement: c.isPrOrAchievement,
        dayQualityFlag: survey?.dayQualityFlag ?? null,
        deviceFeel: feel != null ? formatWorkoutFeelLabel(feel) : null,
        deviceRpe: survey?.rpe ?? null,
        fromDevice: survey?.source === "FIT_IMPORT",
      };
    }),
    dates,
    unflaggedDates,
    dateRange,
    selectedDate,
    totalUnflagged,
    savedFlags,
    onboardingComplete: athlete?.onboardingStep === "COMPLETE",
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = z
      .object({
        flags: z.array(
          z.object({
            activityId: z.string(),
            dayQualityFlag: z.enum(["GREAT", "GOOD", "ROUGH", "BAD"]).nullable(),
          })
        ),
        complete: z.boolean().optional(),
      })
      .parse(await req.json());

    if (body.flags.length > 0) {
      await processFlagBatch(session.user.athleteId, body.flags);
    }

    if (body.complete) {
      await setOnboardingStep(session.user.athleteId, "COMPLETE");
      scheduleSignalingGeneration(session.user.athleteId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[day-flags] POST failed:", e);
    const message =
      e instanceof Error ? e.message : "Could not save day flags";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
