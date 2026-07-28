import type { DayQualityFlag, SessionRole } from "@prisma/client";
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

/**
 * RPE as unexpected effort vs planned session role — not absolute intensity.
 * - EASY: strong signal (easy days shouldn't feel hard)
 * - LONG: light signal (only very high RPE)
 * - INTENSITY / MODERATE: ignored (hard effort is expected / ambiguous)
 */
export function dayQualityFromRoleUnexpectedRpe(
  rpe: number,
  sessionRole: SessionRole | null | undefined
): DayQualityFlag | null {
  if (!(rpe > 0) || sessionRole == null) return null;

  if (sessionRole === "EASY") {
    if (rpe >= 7) return "BAD";
    if (rpe >= 6) return "ROUGH";
    return null;
  }

  if (sessionRole === "LONG") {
    if (rpe >= 9) return "ROUGH";
    return null;
  }

  return null;
}

/** @deprecated Absolute RPE is not a day-quality signal; use role-aware unexpected RPE. */
export function dayQualityFromRpe(_rpe: number): DayQualityFlag | null {
  return null;
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

/**
 * Day quality from feel, optionally worsened by unexpected RPE for the session role.
 * Absolute RPE alone never sets day quality.
 */
export function dayQualityFromFitSelfEval(
  freshness: number | null | undefined,
  rpe: number | null | undefined,
  sessionRole?: SessionRole | null
): DayQualityFlag | null {
  const fromFeel =
    freshness != null ? dayQualityFromWorkoutFeel(freshness) : null;
  const fromRoleRpe =
    rpe != null && rpe > 0
      ? dayQualityFromRoleUnexpectedRpe(rpe, sessionRole)
      : null;
  return worstDayQuality(fromFeel, fromRoleRpe);
}

/**
 * Resolve standout quality for signaling: trust stored flag, and only worsen
 * via role-aware unexpected RPE (never absolute RPE).
 */
export function effectiveDayQuality(
  dayQualityFlag: DayQualityFlag | null | undefined,
  rpe: number | null | undefined,
  sessionRole?: SessionRole | null
): DayQualityFlag | null {
  const fromRoleRpe =
    rpe != null && rpe > 0
      ? dayQualityFromRoleUnexpectedRpe(rpe, sessionRole)
      : null;
  return worstDayQuality(dayQualityFlag, fromRoleRpe);
}

export async function sessionRoleForLinkedActivity(
  athleteId: string,
  activityId: string
): Promise<SessionRole | null> {
  const planned = await db.plannedSession.findFirst({
    where: { athleteId, linkedActivityId: activityId },
    select: { sessionRole: true },
  });
  return planned?.sessionRole ?? null;
}

export function mapFitSelfEvalToSurveyFields(
  selfEval: FitSessionSelfEval,
  sessionRole?: SessionRole | null
): {
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

  const dayQualityFlag = dayQualityFromFitSelfEval(freshness, rpe, sessionRole);

  return { rpe, freshness, dayQualityFlag };
}

export async function upsertFitSelfEvalSurvey(
  athleteId: string,
  activityId: string,
  selfEval: FitSessionSelfEval | undefined
) {
  if (!selfEval) return;

  const sessionRole = await sessionRoleForLinkedActivity(athleteId, activityId);
  const fields = mapFitSelfEvalToSurveyFields(selfEval, sessionRole);
  if (!fields) return;

  const existing = await db.surveyResponse.findUnique({ where: { activityId } });
  if (existing?.source === "HISTORICAL_BACKFILL") return;

  if (existing) {
    const mergedFreshness = existing.freshness ?? fields.freshness;
    const mergedRpe = existing.rpe ?? fields.rpe;
    const dayQualityFlag = dayQualityFromFitSelfEval(
      mergedFreshness,
      mergedRpe,
      sessionRole
    );
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

/** Re-apply feel-first (+ role-aware RPE) standout mapping for FIT-imported surveys. */
export async function remapFitSurveyStandoutFlags(): Promise<number> {
  const surveys = await db.surveyResponse.findMany({
    where: {
      source: "FIT_IMPORT",
      OR: [{ freshness: { not: null } }, { rpe: { not: null } }],
    },
    select: {
      id: true,
      athleteId: true,
      activityId: true,
      freshness: true,
      rpe: true,
      dayQualityFlag: true,
    },
  });

  let updated = 0;
  for (const survey of surveys) {
    if (!survey.activityId) continue;
    const sessionRole = await sessionRoleForLinkedActivity(
      survey.athleteId,
      survey.activityId
    );
    const dayQualityFlag = dayQualityFromFitSelfEval(
      survey.freshness,
      survey.rpe,
      sessionRole
    );
    if (dayQualityFlag !== survey.dayQualityFlag) {
      await db.surveyResponse.update({
        where: { id: survey.id },
        data: { dayQualityFlag },
      });
      updated++;
    }
  }
  return updated;
}
