import type { Discipline, SessionRole, Weekday } from "@prisma/client";
import {
  addDaysToDateKey,
  daysBetweenDateKeys,
} from "@/lib/dates";
import type { PoolSize } from "@/lib/units/discipline-settings";
import type { WorkoutTreeDocument } from "@/lib/workout/workout-tree";
import { serializeWorkoutTree } from "@/lib/workout/workout-tree";
export const MAX_TRAINING_PLAN_DURATION_DAYS = 26 * 7; // 182
export const MAX_TRAINING_PLAN_SESSIONS = 500;
export const TRAINING_PLAN_GAP_WARN_DAYS = 21;
export const TRAINING_PLAN_GAP_BLOCK_DAYS = 90;

/** Absolute-dated sessions used to build a relative library pack (CSV or calendar). */
export type TrainingPlanDraftSessionInput = {
  scheduledDateKey: string;
  discipline: Discipline;
  title: string;
  notes: string | null;
  sessionRole: SessionRole;
  estimatedDurationMinutes: number | null;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: PoolSize | null;
  workoutTree: WorkoutTreeDocument | null;
};

const WEEKDAY_FROM_UTC_DAY: Weekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

export type TrainingPlanSessionDraft = {
  dayOffset: number;
  sortOrder: number;
  discipline: Discipline;
  title: string;
  notes: string | null;
  sessionRole: SessionRole;
  estimatedDurationMinutes: number | null;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: PoolSize | null;
  steps: WorkoutTreeDocument | null;
};

export type TrainingPlanDraft = {
  durationDays: number;
  sessionCount: number;
  anchorWeekday: Weekday;
  sessions: TrainingPlanSessionDraft[];
  maxGapDays: number;
  gapWarning: boolean;
  gapBlocked: boolean;
};

export type ApplyAnchorMode = "start" | "end";

export type ApplyWindowInput = {
  durationDays: number;
  anchorMode: ApplyAnchorMode;
  /** Start date (start mode) or end date (end mode). */
  date: string;
  /** Athlete-local today (yyyy-MM-dd). Used to clamp end-mode windows. */
  todayKey: string;
};

export type ApplyWindowResult = {
  startDate: string;
  endDate: string;
  truncateOffset: number;
  truncated: boolean;
  appliedDurationDays: number;
};

export type ScheduledPlanSession = {
  scheduledDateKey: string;
  dayOffset: number;
  sortOrder: number;
};

export function weekdayFromDateKey(dateKey: string): Weekday {
  const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return WEEKDAY_FROM_UTC_DAY[day]!;
}

/**
 * Convert absolute CSV session dates into relative dayOffset sessions.
 * First session calendar day is offset 0; rest days are gaps (no rows).
 */
export function buildTrainingPlanDraft(
  sessions: TrainingPlanDraftSessionInput[]
): TrainingPlanDraft {
  if (sessions.length === 0) {
    throw new Error("Training plan requires at least one session");
  }
  if (sessions.length > MAX_TRAINING_PLAN_SESSIONS) {
    throw new Error(
      `Training plan may have at most ${MAX_TRAINING_PLAN_SESSIONS} sessions`
    );
  }

  const sorted = [...sessions].sort((a, b) => {
    const byDate = a.scheduledDateKey.localeCompare(b.scheduledDateKey);
    if (byDate !== 0) return byDate;
    return a.title.localeCompare(b.title);
  });

  const firstKey = sorted[0]!.scheduledDateKey;
  const lastKey = sorted[sorted.length - 1]!.scheduledDateKey;
  const durationDays = daysBetweenDateKeys(firstKey, lastKey) + 1;

  if (durationDays > MAX_TRAINING_PLAN_DURATION_DAYS) {
    throw new Error(
      `Training plan may span at most ${MAX_TRAINING_PLAN_DURATION_DAYS} days (26 weeks)`
    );
  }

  const perDayCount = new Map<string, number>();
  const drafts: TrainingPlanSessionDraft[] = [];
  let maxGapDays = 0;
  let prevKey = firstKey;

  for (const session of sorted) {
    const gap = daysBetweenDateKeys(prevKey, session.scheduledDateKey);
    if (gap > maxGapDays) maxGapDays = gap;
    prevKey = session.scheduledDateKey;

    const dayOffset = daysBetweenDateKeys(firstKey, session.scheduledDateKey);
    const sortOrder = perDayCount.get(session.scheduledDateKey) ?? 0;
    perDayCount.set(session.scheduledDateKey, sortOrder + 1);

    drafts.push({
      dayOffset,
      sortOrder,
      discipline: session.discipline,
      title: session.title,
      notes: session.notes,
      sessionRole: session.sessionRole,
      estimatedDurationMinutes: session.estimatedDurationMinutes,
      distanceMeters: session.distanceMeters,
      targetSpeedMps: session.targetSpeedMps,
      targetPaceSeconds: session.targetPaceSeconds,
      poolSize: session.poolSize,
      steps: session.workoutTree
        ? serializeWorkoutTree(session.workoutTree)
        : null,
    });
  }

  return {
    durationDays,
    sessionCount: drafts.length,
    anchorWeekday: weekdayFromDateKey(firstKey),
    sessions: drafts,
    maxGapDays,
    gapWarning: maxGapDays > TRAINING_PLAN_GAP_WARN_DAYS,
    gapBlocked: maxGapDays > TRAINING_PLAN_GAP_BLOCK_DAYS,
  };
}

/**
 * Resolve the calendar window when applying a plan.
 * End mode truncates from the start (keeps the plan suffix) when the ideal
 * start would fall before today.
 */
export function resolveApplyWindow(input: ApplyWindowInput): ApplyWindowResult {
  const { durationDays, anchorMode, date, todayKey } = input;
  if (durationDays < 1) {
    throw new Error("durationDays must be >= 1");
  }

  if (anchorMode === "start") {
    const startDate = date;
    const endDate = addDaysToDateKey(startDate, durationDays - 1);
    return {
      startDate,
      endDate,
      truncateOffset: 0,
      truncated: false,
      appliedDurationDays: durationDays,
    };
  }

  const endDate = date;
  const idealStart = addDaysToDateKey(endDate, -(durationDays - 1));
  if (idealStart >= todayKey) {
    return {
      startDate: idealStart,
      endDate,
      truncateOffset: 0,
      truncated: false,
      appliedDurationDays: durationDays,
    };
  }

  if (endDate < todayKey) {
    throw new Error("End date must be today or later");
  }

  const truncateOffset = daysBetweenDateKeys(idealStart, todayKey);
  const appliedDurationDays = durationDays - truncateOffset;
  return {
    startDate: todayKey,
    endDate,
    truncateOffset,
    truncated: true,
    appliedDurationDays,
  };
}

/** Map plan sessions onto concrete dates given an apply window. */
export function schedulePlanSessions(
  sessions: Array<{ dayOffset: number; sortOrder: number }>,
  window: ApplyWindowResult
): ScheduledPlanSession[] {
  return sessions
    .filter((s) => s.dayOffset >= window.truncateOffset)
    .map((s) => ({
      dayOffset: s.dayOffset,
      sortOrder: s.sortOrder,
      scheduledDateKey: addDaysToDateKey(
        window.startDate,
        s.dayOffset - window.truncateOffset
      ),
    }));
}

export function deepCopyWorkoutSteps(
  steps: unknown
): WorkoutTreeDocument | null {
  if (steps == null) return null;
  return JSON.parse(JSON.stringify(steps)) as WorkoutTreeDocument;
}

/** Recompute library pack aggregates after session CRUD (sparse plans allowed). */
export function recomputeTrainingPlanAggregates(
  sessions: Array<{ dayOffset: number }>
): { sessionCount: number; durationDays: number } {
  const sessionCount = sessions.length;
  if (sessionCount === 0) {
    return { sessionCount: 0, durationDays: 1 };
  }
  let maxOffset = 0;
  for (const s of sessions) {
    if (s.dayOffset > maxOffset) maxOffset = s.dayOffset;
  }
  return { sessionCount, durationDays: maxOffset + 1 };
}

/** Monday-first column order for the training-plan week grid. */
export const WEEKDAYS_MON_FIRST: Weekday[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

export function weekdayIndexMonFirst(weekday: Weekday | string): number {
  const idx = WEEKDAYS_MON_FIRST.indexOf(weekday as Weekday);
  return idx >= 0 ? idx : 0;
}

export function trainingPlanCellForDayOffset(
  anchorWeekday: Weekday | string,
  dayOffset: number
): { week: number; col: number } {
  const index = weekdayIndexMonFirst(anchorWeekday) + dayOffset;
  return { week: Math.floor(index / 7), col: index % 7 };
}

/** Inverse of trainingPlanCellForDayOffset. Null when the cell is before dayOffset 0. */
export function trainingPlanDayOffsetForCell(
  anchorWeekday: Weekday | string,
  week: number,
  col: number
): number | null {
  const dayOffset = week * 7 + col - weekdayIndexMonFirst(anchorWeekday);
  return dayOffset >= 0 ? dayOffset : null;
}

export function trainingPlanWeekCount(
  anchorWeekday: Weekday | string,
  durationDays: number,
  maxDayOffset = -1
): number {
  const span = Math.max(durationDays, maxDayOffset + 1, 1);
  return trainingPlanCellForDayOffset(anchorWeekday, span - 1).week + 1;
}

export type TrainingPlanGridCell<T> = {
  week: number;
  col: number;
  dayOffset: number | null;
  sessions: T[];
};

export function buildTrainingPlanWeekGrid<
  T extends { dayOffset: number; sortOrder: number },
>(
  anchorWeekday: Weekday | string,
  durationDays: number,
  sessions: T[]
): TrainingPlanGridCell<T>[][] {
  const maxOffset = sessions.reduce((m, s) => Math.max(m, s.dayOffset), -1);
  const weeks = trainingPlanWeekCount(anchorWeekday, durationDays, maxOffset);
  const byOffset = new Map<number, T[]>();
  for (const session of sessions) {
    const list = byOffset.get(session.dayOffset) ?? [];
    list.push(session);
    byOffset.set(session.dayOffset, list);
  }
  for (const list of byOffset.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const rows: TrainingPlanGridCell<T>[][] = [];
  for (let week = 0; week < weeks; week++) {
    const row: TrainingPlanGridCell<T>[] = [];
    for (let col = 0; col < 7; col++) {
      const dayOffset = trainingPlanDayOffsetForCell(anchorWeekday, week, col);
      row.push({
        week,
        col,
        dayOffset,
        sessions: dayOffset == null ? [] : (byOffset.get(dayOffset) ?? []),
      });
    }
    rows.push(row);
  }
  return rows;
}
