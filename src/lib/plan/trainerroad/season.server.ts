import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  findOverlappingSeasonPlans,
  getSeasonPlanById,
  type OverlappingSeasonSummary,
} from "@/lib/plan/season/season-plan.server";
import { buildSeasonDateBounds } from "@/lib/plan/season/season-dates";
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
  TrainerRoadSeasonOverlapError,
  type TrainerRoadSeasonOverlap,
  type TrainerRoadSeasonPhase,
} from "./season";

export type TrainerRoadLinkedSeason = {
  id: string;
  name: string;
};

export type TrainerRoadSeasonCreateResult = TrainerRoadLinkedSeason & {
  startDate: string;
  endDate: string;
  phaseCount: number;
  alreadyLinked?: boolean;
};

export type TrainerRoadSeasonSyncResult = {
  updated: boolean;
  season?: TrainerRoadLinkedSeason;
  error?: string;
  overlapping?: TrainerRoadSeasonOverlap[];
};

function toOverlapDtos(rows: OverlappingSeasonSummary[]): TrainerRoadSeasonOverlap[] {
  return rows.map((season) => ({
    id: season.id,
    name: season.name,
    startDate: formatDateKey(season.startDate),
    endDate: formatDateKey(season.endDate),
  }));
}

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

export async function getLinkedTrainerRoadSeason(
  athleteId: string
): Promise<TrainerRoadLinkedSeason | null> {
  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: {
        trainerRoadSeasonPlan: { select: { id: true, name: true } },
      },
    });
    const season = athlete?.trainerRoadSeasonPlan;
    return season ? { id: season.id, name: season.name } : null;
  } catch (error) {
    if (error instanceof Error && /trainerRoadSeasonPlan/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function createTrainerRoadSeason(
  athleteId: string,
  ics: string
): Promise<TrainerRoadSeasonCreateResult> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: {
      trainerRoadIcalUrl: true,
      trainerRoadSeasonPlanId: true,
    },
  });
  if (!athlete?.trainerRoadIcalUrl) {
    throw new Error("Save a TrainerRoad calendar URL first");
  }

  if (athlete.trainerRoadSeasonPlanId) {
    const existing = await getSeasonPlanById(athleteId, athlete.trainerRoadSeasonPlanId);
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        startDate: formatDateKey(existing.startDate),
        endDate: formatDateKey(existing.endDate),
        phaseCount: existing.phases.length,
        alreadyLinked: true,
      };
    }
  }

  const draft = trainerRoadCalendarToSeasonDraft(parseTrainerRoadCalendar(ics));
  if (!draft) {
    throw new Error("This calendar has no TrainerRoad phase markers (Base, Build, Specialty, Rest Week).");
  }

  const bounds = buildSeasonDateBounds(
    parseDateKey(draft.startDateKey),
    parseDateKey(draft.endDateKey)
  );
  const overlapping = await findOverlappingSeasonPlans(
    athleteId,
    bounds.startDate,
    bounds.endDate
  );
  if (overlapping.length > 0) {
    throw new TrainerRoadSeasonOverlapError(toOverlapDtos(overlapping));
  }

  const created = await createSimpleSeasonPlan({
    athleteId,
    name: draft.name,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    trainerRoadDriven: true,
  });
  if (!created) {
    throw new Error("Could not create TrainerRoad season");
  }

  await db.athlete.update({
    where: { id: athleteId },
    data: { trainerRoadSeasonPlanId: created.id },
  });

  const updated = await updateSimpleSeasonPlan(athleteId, created.id, {
    phases: toPhaseWrites(draft.phases),
    recalculate: true,
  });
  const plan = updated ?? created;
  return {
    id: plan.id,
    name: plan.name,
    startDate: formatDateKey(plan.startDate),
    endDate: formatDateKey(plan.endDate),
    phaseCount: plan.phases.length,
  };
}

export async function syncLinkedTrainerRoadSeason(
  athleteId: string,
  ics: string
): Promise<TrainerRoadSeasonSyncResult> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { trainerRoadSeasonPlanId: true },
  });
  const seasonId = athlete?.trainerRoadSeasonPlanId;
  if (!seasonId) return { updated: false };

  const existing = await getSeasonPlanById(athleteId, seasonId);
  if (!existing) {
    await db.athlete.update({
      where: { id: athleteId },
      data: { trainerRoadSeasonPlanId: null },
    });
    return { updated: false };
  }

  const draft = trainerRoadCalendarToSeasonDraft(parseTrainerRoadCalendar(ics));
  if (!draft) {
    return {
      updated: false,
      season: { id: existing.id, name: existing.name },
      error: "This calendar has no TrainerRoad phase markers.",
    };
  }

  const bounds = buildSeasonDateBounds(
    parseDateKey(draft.startDateKey),
    parseDateKey(draft.endDateKey)
  );
  const overlapping = await findOverlappingSeasonPlans(
    athleteId,
    bounds.startDate,
    bounds.endDate,
    seasonId
  );
  if (overlapping.length > 0) {
    return {
      updated: false,
      season: { id: existing.id, name: existing.name },
      error: new TrainerRoadSeasonOverlapError(toOverlapDtos(overlapping)).message,
      overlapping: toOverlapDtos(overlapping),
    };
  }

  const merged = mergeTrainerRoadPhaseWrites(
    draft.phases,
    existingPhasesFromPlan(existing)
  );
  const plan = await updateSimpleSeasonPlan(athleteId, seasonId, {
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    phases: toPhaseWrites(merged),
    recalculate: true,
  });
  const linked = plan ?? existing;
  return {
    updated: true,
    season: { id: linked.id, name: linked.name },
  };
}

export async function unlinkTrainerRoadSeason(athleteId: string): Promise<void> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { trainerRoadSeasonPlanId: true },
  });
  const seasonId = athlete?.trainerRoadSeasonPlanId;
  if (seasonId) {
    await db.seasonPlan.updateMany({
      where: { id: seasonId, athleteId },
      data: { trainerRoadDriven: false },
    });
  }
  await db.athlete.update({
    where: { id: athleteId },
    data: { trainerRoadSeasonPlanId: null },
  });
}
