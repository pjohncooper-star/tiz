import type { DayQualityFlag } from "@prisma/client";
import { db } from "@/lib/db";

/** Garmin FIT session self-evaluation (workoutFeel 0–100, workoutRpe ×10). */
export type FitSessionSelfEval = {
  workoutFeel?: number;
  workoutRpeRaw?: number;
};

/** Garmin discrete feel buckets: 0=Very Weak, 25=Weak, 50=Normal, 75=Strong, 100=Very Strong. */
export function parseFitSessionSelfEval(
  session: Record<string, unknown>
): FitSessionSelfEval | undefined {
  const workoutFeel = session.workoutFeel as number | undefined;
  const workoutRpeRaw = session.workoutRpe as number | undefined;
  const feel =
    typeof workoutFeel === "number" && workoutFeel >= 0
      ? Math.round(workoutFeel)
      : undefined;
  const rpe =
    typeof workoutRpeRaw === "number" && workoutRpeRaw > 0
      ? Math.round(workoutRpeRaw)
      : undefined;
  if (feel == null && rpe == null) return undefined;
  return { workoutFeel: feel, workoutRpeRaw: rpe };
}

/** FIT workoutRpe is Borg 0–10 × 10 (10 → RPE 1). */
export function parseRpeFromFit(workoutRpeRaw: number | undefined): number | null {
  if (workoutRpeRaw == null || workoutRpeRaw <= 0) return null;
  return Math.min(10, Math.max(1, Math.round(workoutRpeRaw / 10)));
}

export function formatWorkoutFeelLabel(feel: number): string {
  if (feel <= 12) return "Very weak";
  if (feel <= 37) return "Weak";
  if (feel <= 62) return "Normal";
  if (feel <= 87) return "Strong";
  return "Very strong";
}

/** Map Garmin workoutFeel (0–100) to standout day flags (step 6). */
export function dayQualityFromWorkoutFeel(feel: number): DayQualityFlag {
  if (feel <= 12) return "BAD";
  if (feel <= 37) return "ROUGH";
  if (feel <= 62) return "GOOD";
  return "GREAT";
}

export function dayQualityFromRpe(rpe: number): DayQualityFlag {
  if (rpe <= 4) return "GOOD";
  if (rpe <= 6) return "ROUGH";
  return "BAD";
}

const DAY_QUALITY_RANK: Record<DayQualityFlag, number> = {
  BAD: 0,
  ROUGH: 1,
  GOOD: 2,
  GREAT: 3,
};

/** Pick the worst (lowest) day-quality tier when multiple signals disagree. */
export function worstDayQuality(
  ...flags: Array<DayQualityFlag | null | undefined>
): DayQualityFlag | null {
  const present = flags.filter((flag): flag is DayQualityFlag => flag != null);
  if (present.length === 0) return null;
  return present.reduce((worst, flag) =>
    DAY_QUALITY_RANK[flag] < DAY_QUALITY_RANK[worst] ? flag : worst
  );
}

export function dayQualityFromFitSelfEval(
  freshness: number | null | undefined,
  rpe: number | null | undefined
): DayQualityFlag | null {
  const fromFeel =
    freshness != null ? dayQualityFromWorkoutFeel(freshness) : null;
  const fromRpe = rpe != null && rpe > 0 ? dayQualityFromRpe(rpe) : null;
  return worstDayQuality(fromFeel, fromRpe);
}

export function effectiveDayQuality(
  dayQualityFlag: DayQualityFlag | null | undefined,
  rpe: number | null | undefined
): DayQualityFlag | null {
  const fromRpe = rpe != null && rpe > 0 ? dayQualityFromRpe(rpe) : null;
  return worstDayQuality(dayQualityFlag, fromRpe);
}

export function mapFitSelfEvalToSurveyFields(selfEval: FitSessionSelfEval): {
  rpe: number | null;
  freshness: number | null;
  dayQualityFlag: DayQualityFlag | null;
} | null {
  const freshness =
    selfEval.workoutFeel != null && selfEval.workoutFeel >= 0
      ? selfEval.workoutFeel
      : null;
  const rpe = parseRpeFromFit(selfEval.workoutRpeRaw);

  if (freshness == null && rpe == null) return null;

  const dayQualityFlag = dayQualityFromFitSelfEval(freshness, rpe);

  return { rpe, freshness, dayQualityFlag };
}

export async function upsertFitSelfEvalSurvey(
  athleteId: string,
  activityId: string,
  selfEval: FitSessionSelfEval | undefined
) {
  if (!selfEval) return;

  const fields = mapFitSelfEvalToSurveyFields(selfEval);
  if (!fields) return;

  const existing = await db.surveyResponse.findUnique({ where: { activityId } });
  if (existing?.source === "HISTORICAL_BACKFILL") return;

  if (existing) {
    const mergedFreshness = existing.freshness ?? fields.freshness;
    const mergedRpe = existing.rpe ?? fields.rpe;
    const dayQualityFlag = dayQualityFromFitSelfEval(mergedFreshness, mergedRpe);
    await db.surveyResponse.update({
      where: { activityId },
      data: {
        rpe: mergedRpe,
        freshness: mergedFreshness,
        dayQualityFlag,
      },
    });
    return;
  }

  await db.surveyResponse.create({
    data: {
      athleteId,
      activityId,
      rpe: fields.rpe,
      freshness: fields.freshness,
      dayQualityFlag: fields.dayQualityFlag,
      source: "FIT_IMPORT",
    },
  });
}

export const DAY_QUALITY_LABELS: Record<DayQualityFlag, string> = {
  GREAT: "Great",
  GOOD: "Good",
  ROUGH: "Rough",
  BAD: "Bad",
};

/** Re-apply standout mapping for FIT-imported surveys using feel and RPE together. */
export async function remapFitSurveyStandoutFlags(): Promise<number> {
  const surveys = await db.surveyResponse.findMany({
    where: {
      source: "FIT_IMPORT",
      OR: [{ freshness: { not: null } }, { rpe: { not: null } }],
    },
    select: { id: true, freshness: true, rpe: true, dayQualityFlag: true },
  });

  let updated = 0;
  for (const survey of surveys) {
    const dayQualityFlag = dayQualityFromFitSelfEval(survey.freshness, survey.rpe);
    if (dayQualityFlag && survey.dayQualityFlag !== dayQualityFlag) {
      await db.surveyResponse.update({
        where: { id: survey.id },
        data: { dayQualityFlag },
      });
      updated++;
    }
  }
  return updated;
}
