import type { EventPriority, GoalEventDiscipline, Prisma } from "@prisma/client";
import {
  linkCalendarRaceToGoalEvent,
  syncRaceToCalendar,
  unlinkRaceFromCalendar,
  type GoalEventRaceInput,
} from "@/lib/plan/race-calendar-sync";

type Tx = Prisma.TransactionClient;

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export type GoalEventWriteInput = {
  id?: string;
  name: string;
  date: Date;
  disciplines: GoalEventDiscipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
};

export type RemovedGoalEventInput = {
  id: string;
  deleteFromCalendar?: boolean;
};

export type LinkCalendarRaceInput = GoalEventWriteInput & {
  plannedSessionId: string;
  priority: EventPriority;
};

function toRaceInput(
  event: {
    id: string;
    athleteId: string;
    seasonPlanId: string;
    name: string;
    date: Date;
    disciplines: GoalEventDiscipline[];
    priority: EventPriority;
    distanceMeters?: number | null;
    estimatedDurationMinutes?: number | null;
    taperDaysBefore?: number | null;
    notes?: string | null;
    plannedSessionId?: string | null;
  }
): GoalEventRaceInput {
  return {
    id: event.id,
    athleteId: event.athleteId,
    seasonPlanId: event.seasonPlanId,
    name: event.name,
    date: event.date,
    disciplines: event.disciplines,
    priority: event.priority,
    distanceMeters: event.distanceMeters,
    estimatedDurationMinutes: event.estimatedDurationMinutes,
    taperDaysBefore: event.taperDaysBefore,
    notes: event.notes,
    plannedSessionId: event.plannedSessionId,
  };
}

export async function upsertGoalEventWithCalendar(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    priority: EventPriority;
    input: GoalEventWriteInput;
  }
): Promise<string> {
  const { athleteId, seasonPlanId, priority, input } = params;
  let eventId = input.id;

  if (eventId) {
    await tx.goalEvent.update({
      where: { id: eventId },
      data: {
        name: input.name,
        date: input.date,
        disciplines: input.disciplines,
        distanceMeters: input.distanceMeters ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        taperDaysBefore: input.taperDaysBefore ?? null,
        notes: input.notes ?? null,
        priority,
      },
    });
  } else {
    eventId = cuid();
    await tx.goalEvent.create({
      data: {
        id: eventId,
        athleteId,
        seasonPlanId,
        name: input.name,
        date: input.date,
        disciplines: input.disciplines,
        priority,
        distanceMeters: input.distanceMeters ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        taperDaysBefore: input.taperDaysBefore ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  const row = await tx.goalEvent.findUniqueOrThrow({ where: { id: eventId } });
  await syncRaceToCalendar(tx, toRaceInput(row));
  return eventId;
}

export async function syncGoalEventsByPriority(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    priority: EventPriority;
    inputs: GoalEventWriteInput[];
    existingIds: string[];
  }
): Promise<void> {
  const kept = new Set<string>();

  for (const input of params.inputs) {
    const id = await upsertGoalEventWithCalendar(tx, {
      athleteId: params.athleteId,
      seasonPlanId: params.seasonPlanId,
      priority: params.priority,
      input,
    });
    kept.add(id);
  }

  for (const id of params.existingIds) {
    if (!kept.has(id)) {
      await unlinkRaceFromCalendar(tx, id, { deleteSessions: true });
      await tx.goalEvent.delete({ where: { id } });
    }
  }
}

export async function removeGoalEvents(
  tx: Tx,
  removed: RemovedGoalEventInput[]
): Promise<void> {
  for (const item of removed) {
    await unlinkRaceFromCalendar(tx, item.id, {
      deleteSessions: item.deleteFromCalendar ?? false,
    });
    await tx.goalEvent.delete({ where: { id: item.id } });
  }
}

export async function upsertPrimaryGoalEvent(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    input: GoalEventWriteInput;
    existingPrimaryId: string | null;
  }
): Promise<string> {
  const inputWithId = {
    ...params.input,
    id: params.existingPrimaryId ?? params.input.id,
  };
  const eventId = await upsertGoalEventWithCalendar(tx, {
    athleteId: params.athleteId,
    seasonPlanId: params.seasonPlanId,
    priority: "A",
    input: inputWithId,
  });

  await tx.seasonPlan.update({
    where: { id: params.seasonPlanId },
    data: { primaryGoalEventId: eventId },
  });

  return eventId;
}

export async function linkCalendarRacesToPlan(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    links: LinkCalendarRaceInput[];
  }
): Promise<void> {
  for (const link of params.links) {
    const eventId = link.id ?? cuid();
    if (!link.id) {
      await tx.goalEvent.create({
        data: {
          id: eventId,
          athleteId: params.athleteId,
          seasonPlanId: params.seasonPlanId,
          name: link.name,
          date: link.date,
          disciplines: link.disciplines,
          priority: link.priority,
          distanceMeters: link.distanceMeters ?? null,
          estimatedDurationMinutes: link.estimatedDurationMinutes ?? null,
          notes: link.notes ?? null,
        },
      });
      if (link.priority === "A") {
        await tx.seasonPlan.update({
          where: { id: params.seasonPlanId },
          data: { primaryGoalEventId: eventId },
        });
      }
    }

    await linkCalendarRaceToGoalEvent(tx, {
      athleteId: params.athleteId,
      seasonPlanId: params.seasonPlanId,
      goalEventId: eventId,
      plannedSessionId: link.plannedSessionId,
      priority: link.priority,
      name: link.name,
      date: link.date,
      disciplines: link.disciplines,
      distanceMeters: link.distanceMeters,
      estimatedDurationMinutes: link.estimatedDurationMinutes,
      notes: link.notes,
    });
  }
}

export async function createGoalEventsWithCalendar(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    primary?: GoalEventWriteInput;
    bGoalEvents?: GoalEventWriteInput[];
    cGoalEvents?: GoalEventWriteInput[];
  }
): Promise<string | null> {
  let primaryId: string | null = null;
  if (params.primary) {
    primaryId = await upsertGoalEventWithCalendar(tx, {
      athleteId: params.athleteId,
      seasonPlanId: params.seasonPlanId,
      priority: "A",
      input: params.primary,
    });
    await tx.seasonPlan.update({
      where: { id: params.seasonPlanId },
      data: { primaryGoalEventId: primaryId },
    });
  }

  if (params.bGoalEvents?.length) {
    for (const input of params.bGoalEvents) {
      await upsertGoalEventWithCalendar(tx, {
        athleteId: params.athleteId,
        seasonPlanId: params.seasonPlanId,
        priority: "B",
        input,
      });
    }
  }

  if (params.cGoalEvents?.length) {
    for (const input of params.cGoalEvents) {
      await upsertGoalEventWithCalendar(tx, {
        athleteId: params.athleteId,
        seasonPlanId: params.seasonPlanId,
        priority: "C",
        input,
      });
    }
  }

  return primaryId;
}
