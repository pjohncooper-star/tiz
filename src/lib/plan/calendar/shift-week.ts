import {
  addDaysToDateKey,
  daysBetweenDateKeys,
  formatDateKey,
} from "@/lib/dates";
import type { Discipline } from "@prisma/client";

export type ShiftWeekSession = {
  id: string;
  scheduledDateKey: string;
  discipline: Discipline;
  source: string;
};

export type SeasonDateRange = {
  id: string;
  name: string;
  startDateKey: string;
  endDateKey: string;
};

export type ShiftWeekPlanInput = {
  weekStart: string;
  targetDate: string;
  discipline?: Discipline | null;
  sessions: ShiftWeekSession[];
  seasons: SeasonDateRange[];
};

export type ShiftWeekPlan =
  | {
      ok: true;
      deltaDays: number;
      moveIds: string[];
      deleteIds: string[];
      wallSeason: SeasonDateRange | null;
      wallDateKey: string | null;
    }
  | {
      ok: false;
      code: "IN_SEASON" | "INVALID_DATE" | "NO_OP";
      message: string;
      season?: SeasonDateRange;
    };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function findSeasonContainingDate(
  dateKey: string,
  seasons: SeasonDateRange[]
): SeasonDateRange | null {
  for (const season of seasons) {
    if (dateKey >= season.startDateKey && dateKey <= season.endDateKey) {
      return season;
    }
  }
  return null;
}

/** Earliest non-containing season that starts strictly after `dateKey`. */
export function findNextSeasonWall(
  dateKey: string,
  seasons: SeasonDateRange[]
): SeasonDateRange | null {
  const upcoming = seasons
    .filter((season) => season.startDateKey > dateKey)
    .sort((a, b) => a.startDateKey.localeCompare(b.startDateKey));
  return upcoming[0] ?? null;
}

/**
 * Plan a calendar shift: all non-race sessions on/after weekStart (optionally
 * one discipline) move by (targetDate - weekStart) days. Sessions that would
 * land on/after the next season start are deleted instead.
 */
export function planWeekShift(input: ShiftWeekPlanInput): ShiftWeekPlan {
  const { weekStart, targetDate, discipline, sessions, seasons } = input;

  if (!DATE_KEY.test(weekStart) || !DATE_KEY.test(targetDate)) {
    return {
      ok: false,
      code: "INVALID_DATE",
      message: "weekStart and targetDate must be yyyy-MM-dd",
    };
  }

  const containing = findSeasonContainingDate(weekStart, seasons);
  if (containing) {
    return {
      ok: false,
      code: "IN_SEASON",
      message: `Shift is unavailable while this week is inside season “${containing.name}”.`,
      season: containing,
    };
  }

  const deltaDays = daysBetweenDateKeys(weekStart, targetDate);
  if (deltaDays === 0) {
    return {
      ok: false,
      code: "NO_OP",
      message: "Choose a different date to shift.",
    };
  }

  const wallSeason = findNextSeasonWall(weekStart, seasons);
  const wallDateKey = wallSeason?.startDateKey ?? null;

  const moveIds: string[] = [];
  const deleteIds: string[] = [];

  for (const session of sessions) {
    if (session.source === "RACE") continue;
    if (session.scheduledDateKey < weekStart) continue;
    if (discipline && session.discipline !== discipline) continue;

    const nextKey = addDaysToDateKey(session.scheduledDateKey, deltaDays);
    if (wallDateKey && nextKey >= wallDateKey) {
      deleteIds.push(session.id);
    } else {
      moveIds.push(session.id);
    }
  }

  return {
    ok: true,
    deltaDays,
    moveIds,
    deleteIds,
    wallSeason,
    wallDateKey,
  };
}

export function seasonRangesFromDb(
  seasons: { id: string; name: string; startDate: Date; endDate: Date }[]
): SeasonDateRange[] {
  return seasons.map((season) => ({
    id: season.id,
    name: season.name,
    startDateKey: formatDateKey(season.startDate),
    endDateKey: formatDateKey(season.endDate),
  }));
}
