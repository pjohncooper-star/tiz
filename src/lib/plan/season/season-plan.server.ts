import { type SeasonStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { calendarDateFromDb, formatDateKey } from "@/lib/dates";
import { suggestPhasesForWeeks } from "./default-phases";
import { deriveSeasonStatus, seasonRangesOverlap } from "./season-dates";
import { type GoalEventWriteInput } from "./goal-events-sync";

export type { GoalEventWriteInput };

export type SeasonPlanSummary = {
  id: string;
  name: string;
  status: SeasonStatus;
  totalWeeks: number;
  startDate: Date;
  endDate: Date;
  totalPlannedHours: number;
};

const seasonPlanDetailInclude = {
  primaryGoalEvent: true,
  phases: {
    orderBy: { sortOrder: "asc" as const },
    include: { disciplines: true, mesocycles: { orderBy: { index: "asc" as const } } },
  },
  weeks: { orderBy: { weekIndex: "asc" as const } },
  goalEvents: true,
};

export async function getCurrentSeasonPlan(athleteId: string) {
  const active = await db.seasonPlan.findFirst({
    where: { athleteId, status: "ACTIVE", setupComplete: true },
    orderBy: { startDate: "desc" },
    include: {
      primaryGoalEvent: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
      },
      weeks: { orderBy: { weekIndex: "asc" } },
      goalEvents: true,
    },
  });
  if (active) return active;

  return db.seasonPlan.findFirst({
    where: { athleteId, status: "DRAFT" },
    orderBy: { startDate: "asc" },
    include: {
      primaryGoalEvent: true,
      phases: {
        orderBy: { sortOrder: "asc" },
        include: { disciplines: true, mesocycles: { orderBy: { index: "asc" } } },
      },
      weeks: { orderBy: { weekIndex: "asc" } },
      goalEvents: true,
    },
  });
}

export async function hasSetupCompleteSeason(athleteId: string): Promise<boolean> {
  const count = await db.seasonPlan.count({
    where: { athleteId, setupComplete: true, status: { not: "ARCHIVED" } },
  });
  return count > 0;
}

export async function listSeasonPlansForAthlete(athleteId: string) {
  return db.seasonPlan.findMany({
    where: { athleteId, status: { not: "ARCHIVED" } },
    orderBy: { startDate: "desc" },
    include: {
      primaryGoalEvent: true,
      phases: { orderBy: { sortOrder: "asc" } },
      weeks: { select: { totalHours: true } },
    },
  });
}

export async function getSeasonPlanById(athleteId: string, seasonPlanId: string) {
  return db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
    include: seasonPlanDetailInclude,
  });
}

/** Most recent non-archived season — used by the simple planner (includes drafts and incomplete plans). */
export async function getSimplePlannerSeason(athleteId: string, seasonPlanId?: string | null) {
  if (seasonPlanId) {
    return getSeasonPlanById(athleteId, seasonPlanId);
  }
  return db.seasonPlan.findFirst({
    where: { athleteId, status: { not: "ARCHIVED" } },
    orderBy: { startDate: "desc" },
    include: seasonPlanDetailInclude,
  });
}

export type OverlappingSeasonSummary = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  setupComplete: boolean;
  status: SeasonStatus;
};

export async function findOverlappingSeasonPlans(
  athleteId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonPlanId?: string
): Promise<OverlappingSeasonSummary[]> {
  const existing = await db.seasonPlan.findMany({
    where: {
      athleteId,
      status: { not: "ARCHIVED" },
      ...(excludeSeasonPlanId ? { id: { not: excludeSeasonPlanId } } : {}),
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      setupComplete: true,
      status: true,
    },
  });

  const candidate = {
    id: excludeSeasonPlanId,
    startDate,
    endDate,
  };

  return existing.filter((season) =>
    seasonRangesOverlap(candidate, {
      id: season.id,
      startDate: calendarDateFromDb(season.startDate),
      endDate: calendarDateFromDb(season.endDate),
    })
  );
}

export async function assertNoSeasonOverlap(
  athleteId: string,
  startDate: Date,
  endDate: Date,
  excludeSeasonPlanId?: string
): Promise<void> {
  const overlapping = await findOverlappingSeasonPlans(
    athleteId,
    startDate,
    endDate,
    excludeSeasonPlanId
  );

  if (overlapping.length > 0) {
    throw new Error(formatSeasonOverlapError(overlapping));
  }
}

export function formatSeasonOverlapError(overlapping: OverlappingSeasonSummary[]): string {
  const listed = overlapping
    .map(
      (season) =>
        `${season.name} (${formatDateKey(season.startDate)} → ${formatDateKey(season.endDate)})`
    )
    .join("; ");
  return `Season dates overlap an existing season: ${listed}. Open it from Plan, archive it under All seasons, or choose different dates.`;
}

export { suggestPhasesForWeeks };

export async function refreshSeasonPlanStatus(seasonPlanId: string) {
  const plan = await db.seasonPlan.findUniqueOrThrow({
    where: { id: seasonPlanId },
  });
  if (plan.status === "ARCHIVED") return plan;

  const next = deriveSeasonStatus(
    calendarDateFromDb(plan.startDate),
    calendarDateFromDb(plan.endDate)
  );
  if (next !== plan.status) {
    return db.seasonPlan.update({
      where: { id: seasonPlanId },
      data: { status: next },
    });
  }
  return plan;
}

export async function archiveSeasonPlan(athleteId: string, seasonPlanId: string) {
  const plan = await db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
  });
  if (!plan) {
    throw new Error("Season plan not found");
  }
  return db.seasonPlan.update({
    where: { id: seasonPlanId },
    data: { status: "ARCHIVED" },
  });
}

export function seasonPlanToSummary(plan: {
  id: string;
  name: string;
  status: SeasonStatus;
  totalWeeks: number;
  startDate: Date;
  endDate: Date;
  weeks?: { totalHours: number }[];
}): SeasonPlanSummary {
  const totalPlannedHours =
    plan.weeks?.reduce((sum, w) => sum + w.totalHours, 0) ?? 0;
  return {
    id: plan.id,
    name: plan.name,
    status: plan.status,
    totalWeeks: plan.totalWeeks,
    startDate: plan.startDate,
    endDate: plan.endDate,
    totalPlannedHours: Math.round(totalPlannedHours * 10) / 10,
  };
}

export { seasonRangesOverlap };
