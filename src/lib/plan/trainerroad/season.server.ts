import { formatDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { getSeasonPlanById } from "@/lib/plan/season/season-plan.server";
import type { GoalEventWriteInput } from "@/lib/plan/season/goal-events-sync";
import {
  createSimpleSeasonPlan,
  serializeSimpleSeasonPlan,
  updateSimpleSeasonPlan,
  type SimplePhaseWrite,
} from "@/lib/plan/season/simple-planner.server";
import { parseTrainerRoadCalendar } from "./calendar";
import {
  mergeTrainerRoadPhaseWrites,
  trainerRoadCalendarToSeasonDraft,
  type TrainerRoadSeasonOverlap,
  type TrainerRoadSeasonPhase,
} from "./season";

export type TrainerRoadLinkedSeason = {
  id: string;
  name: string;
};

export type TrainerRoadSeasonSyncResult = {
  updated: boolean;
  seasons: TrainerRoadLinkedSeason[];
  error?: string;
  overlapping?: TrainerRoadSeasonOverlap[];
};

function toPhaseWrites(phases: TrainerRoadSeasonPhase[]): SimplePhaseWrite[] {
  return phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    color: phase.color,
    phaseKind: phase.phaseKind,
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    rampEnabled: phase.rampEnabled,
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    strengthSessionsPerWeek: phase.strengthSessionsPerWeek,
    swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
    bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
    runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
    goal: phase.goal,
    zoneSplits: phase.zoneSplits,
    weeklyTemplateId: phase.weeklyTemplateId,
    planningMode: phase.planningMode,
    longRideStartMin: phase.longRideStartMin,
    longRideEndMin: phase.longRideEndMin,
    longRunStartMin: phase.longRunStartMin,
    longRunEndMin: phase.longRunEndMin,
    longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
    longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
    longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
    longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
    volumeMesocycleMode: phase.volumeMesocycleMode,
    volumeProgressionMode: phase.volumeProgressionMode,
    volumeStartHours: phase.volumeStartHours,
    volumeEndHours: phase.volumeEndHours,
    volumeRampPercent: phase.volumeRampPercent,
    volumeStepHours: phase.volumeStepHours,
    swimStartHours: phase.swimStartHours,
    swimEndHours: phase.swimEndHours,
    swimRampPercent: phase.swimRampPercent,
    swimStepHours: phase.swimStepHours,
    bikeStartHours: phase.bikeStartHours,
    bikeEndHours: phase.bikeEndHours,
    bikeRampPercent: phase.bikeRampPercent,
    bikeStepHours: phase.bikeStepHours,
    runStartHours: phase.runStartHours,
    runEndHours: phase.runEndHours,
    runRampPercent: phase.runRampPercent,
    runStepHours: phase.runStepHours,
  }));
}

function existingPhasesFromPlan(
  plan: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>
): TrainerRoadSeasonPhase[] {
  return serializeSimpleSeasonPlan(plan).phases;
}

function seasonHasARace(
  plan: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>
): boolean {
  const primary = plan.primaryGoalEvent;
  if (primary?.name.trim() && primary.date) return true;
  return plan.goalEvents.some(
    (event) => event.priority === "A" && event.name.trim() && event.date
  );
}

export async function athleteHasTrainerRoadCalendar(athleteId: string): Promise<boolean> {
  return Boolean(await getTrainerRoadIcalUrl(athleteId));
}

export async function getTrainerRoadIcalUrl(athleteId: string): Promise<string | null> {
  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { trainerRoadIcalUrl: true },
    });
    return athlete?.trainerRoadIcalUrl ?? null;
  } catch (error) {
    if (error instanceof Error && /trainerRoadIcalUrl|column/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function listTrainerRoadDrivenSeasons(
  athleteId: string
): Promise<TrainerRoadLinkedSeason[]> {
  try {
    const seasons = await db.seasonPlan.findMany({
      where: { athleteId, trainerRoadDriven: true, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { startDate: "asc" },
    });
    return seasons;
  } catch (error) {
    if (error instanceof Error && /trainerRoadDriven|column/i.test(error.message)) {
      return [];
    }
    throw error;
  }
}

const NO_MARKERS_IN_WINDOW =
  "This calendar has no TrainerRoad phase markers in this season’s dates.";

export async function applyTrainerRoadCalendarToSeason(
  athleteId: string,
  seasonId: string,
  ics: string,
  options?: { requireARace?: boolean }
): Promise<NonNullable<Awaited<ReturnType<typeof updateSimpleSeasonPlan>>>> {
  const existing = await getSeasonPlanById(athleteId, seasonId);
  if (!existing) {
    throw new Error("Season not found");
  }
  if (options?.requireARace !== false && !seasonHasARace(existing)) {
    throw new Error("Add an A Race (name and date) before following TrainerRoad phases.");
  }

  const draft = trainerRoadCalendarToSeasonDraft(parseTrainerRoadCalendar(ics), {
    startDateKey: formatDateKey(existing.startDate),
    endDateKey: formatDateKey(existing.endDate),
  });
  if (!draft) {
    throw new Error(NO_MARKERS_IN_WINDOW);
  }

  const merged = mergeTrainerRoadPhaseWrites(draft.phases, existingPhasesFromPlan(existing));
  const plan = await updateSimpleSeasonPlan(athleteId, seasonId, {
    trainerRoadDriven: true,
    phases: toPhaseWrites(merged),
    recalculate: true,
  });
  if (!plan) {
    throw new Error("Could not update TrainerRoad season");
  }
  return plan;
}

export async function createSeasonFromTrainerRoadCalendar(
  athleteId: string,
  ics: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    goalEvent: GoalEventWriteInput;
  }
) {
  const draft = trainerRoadCalendarToSeasonDraft(parseTrainerRoadCalendar(ics), {
    startDateKey: formatDateKey(input.startDate),
    endDateKey: formatDateKey(input.endDate),
  });
  if (!draft) {
    throw new Error(NO_MARKERS_IN_WINDOW);
  }

  const created = await createSimpleSeasonPlan({
    athleteId,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    trainerRoadDriven: true,
    goalEvent: input.goalEvent,
  });
  if (!created) {
    throw new Error("Could not create TrainerRoad season");
  }

  const plan = await updateSimpleSeasonPlan(athleteId, created.id, {
    trainerRoadDriven: true,
    phases: toPhaseWrites(draft.phases),
    recalculate: true,
  });
  return plan ?? created;
}

export async function detachTrainerRoadFromSeason(
  athleteId: string,
  seasonId: string
) {
  return updateSimpleSeasonPlan(athleteId, seasonId, {
    trainerRoadDriven: false,
  });
}

export async function syncTrainerRoadDrivenSeasons(
  athleteId: string,
  ics: string
): Promise<TrainerRoadSeasonSyncResult> {
  const driven = await listTrainerRoadDrivenSeasons(athleteId);
  if (driven.length === 0) return { updated: false, seasons: [] };

  const seasons: TrainerRoadLinkedSeason[] = [];
  let updated = false;
  let error: string | undefined;

  for (const row of driven) {
    try {
      const plan = await applyTrainerRoadCalendarToSeason(athleteId, row.id, ics, {
        requireARace: false,
      });
      seasons.push({ id: plan.id, name: plan.name });
      updated = true;
    } catch (caught) {
      seasons.push(row);
      const message =
        caught instanceof Error ? caught.message : "Could not update TrainerRoad season";
      if (!error) error = message;
    }
  }

  return { updated, seasons, error };
}

export async function unlinkTrainerRoadSeasons(athleteId: string): Promise<void> {
  try {
    await db.seasonPlan.updateMany({
      where: { athleteId, trainerRoadDriven: true },
      data: { trainerRoadDriven: false },
    });
  } catch (error) {
    if (error instanceof Error && /trainerRoadDriven|column/i.test(error.message)) {
      return;
    }
    throw error;
  }
}
