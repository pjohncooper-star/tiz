import type {
  Discipline,
  GoalEventDiscipline,
  PlannedSession,
  Prisma,
} from "@prisma/client";

const LEG_ORDER: GoalEventDiscipline[] = ["SWIM", "BIKE", "RUN"];

export type GoalEventRaceInput = {
  id: string;
  athleteId: string;
  seasonPlanId: string;
  name: string;
  date: Date;
  disciplines: GoalEventDiscipline[];
  priority: "A" | "B" | "C";
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
  plannedSessionId?: string | null;
};

type Tx = Prisma.TransactionClient;

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

function orderedDisciplines(disciplines: GoalEventDiscipline[]): GoalEventDiscipline[] {
  const set = new Set(disciplines);
  return LEG_ORDER.filter((d) => set.has(d));
}

function isMultisport(disciplines: GoalEventDiscipline[]): boolean {
  return orderedDisciplines(disciplines).length > 1;
}

function disciplineToEnum(d: GoalEventDiscipline): Discipline {
  return d as Discipline;
}

function goalMinutesForLeg(
  goalEvent: GoalEventRaceInput,
  discipline: GoalEventDiscipline
): number | null {
  switch (discipline) {
    case "SWIM":
      return goalEvent.swimGoalMinutes ?? goalEvent.estimatedDurationMinutes ?? null;
    case "BIKE":
      return goalEvent.bikeGoalMinutes ?? goalEvent.estimatedDurationMinutes ?? null;
    case "RUN":
      return goalEvent.runGoalMinutes ?? goalEvent.estimatedDurationMinutes ?? null;
    default:
      return goalEvent.estimatedDurationMinutes ?? null;
  }
}

async function sessionsForGoalEvent(tx: Tx, goalEventId: string): Promise<PlannedSession[]> {
  return tx.plannedSession.findMany({
    where: { goalEventId },
    orderBy: [{ sessionIndex: "asc" }, { id: "asc" }],
  });
}

async function sessionsByMultisportGroup(
  tx: Tx,
  multisportGroupId: string
): Promise<PlannedSession[]> {
  return tx.plannedSession.findMany({
    where: { multisportGroupId },
    orderBy: [{ sessionIndex: "asc" }, { id: "asc" }],
  });
}

export async function findUnlinkedRaceSessions(
  athleteId: string,
  startDate: Date,
  endDate: Date
): Promise<PlannedSession[]> {
  const { db } = await import("@/lib/db");
  const sessions = await db.plannedSession.findMany({
    where: {
      athleteId,
      source: "RACE",
      goalEventId: null,
      scheduledDate: { gte: startDate, lte: endDate },
    },
    orderBy: [{ scheduledDate: "asc" }, { sessionIndex: "asc" }],
  });

  const seen = new Set<string>();
  const result: PlannedSession[] = [];
  for (const s of sessions) {
    const key = s.multisportGroupId ?? s.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.multisportGroupId) {
      const group = sessions.filter((x) => x.multisportGroupId === s.multisportGroupId);
      result.push(group[0]!);
    } else {
      result.push(s);
    }
  }
  return result;
}

export async function syncRaceToCalendar(
  tx: Tx,
  goalEvent: GoalEventRaceInput
): Promise<void> {
  const disciplines = orderedDisciplines(goalEvent.disciplines);
  if (disciplines.length === 0) return;

  const existing = await sessionsForGoalEvent(tx, goalEvent.id);
  const multisport = isMultisport(disciplines);
  const groupId = multisport
    ? existing[0]?.multisportGroupId ?? `race-${goalEvent.id}`
    : null;

  if (!multisport) {
    const discipline = disciplineToEnum(disciplines[0]!);
    const primary = existing[0];
    if (primary) {
      await tx.plannedSession.update({
        where: { id: primary.id },
        data: {
          scheduledDate: goalEvent.date,
          discipline,
          title: goalEvent.name,
          notes: goalEvent.notes ?? null,
          distanceMeters: goalEvent.distanceMeters ?? null,
          estimatedDurationMinutes: goalMinutesForLeg(goalEvent, disciplines[0]!),
          source: "RACE",
          goalEventId: goalEvent.id,
          multisportGroupId: null,
          sessionIndex: null,
        },
      });
      for (const extra of existing.slice(1)) {
        await tx.plannedSession.delete({ where: { id: extra.id } });
      }
      await tx.goalEvent.update({
        where: { id: goalEvent.id },
        data: { plannedSessionId: primary.id },
      });
      return;
    }

    const sessionId = cuid();
    await tx.plannedSession.create({
      data: {
        id: sessionId,
        athleteId: goalEvent.athleteId,
        scheduledDate: goalEvent.date,
        discipline,
        title: goalEvent.name,
        notes: goalEvent.notes ?? null,
        distanceMeters: goalEvent.distanceMeters ?? null,
        estimatedDurationMinutes: goalMinutesForLeg(goalEvent, discipline),
        source: "RACE",
        goalEventId: goalEvent.id,
      },
    });
    await tx.goalEvent.update({
      where: { id: goalEvent.id },
      data: { plannedSessionId: sessionId },
    });
    return;
  }

  const legIds: string[] = [];

  for (let i = 0; i < disciplines.length; i++) {
    const d = disciplines[i]!;
    const existingLeg = existing.find(
      (s) => s.sessionIndex === i || s.discipline === disciplineToEnum(d)
    );
    const legId = existingLeg?.id ?? cuid();
    legIds.push(legId);

    const data = {
      athleteId: goalEvent.athleteId,
      scheduledDate: goalEvent.date,
      discipline: disciplineToEnum(d),
      title: goalEvent.name,
      notes: goalEvent.notes ?? null,
      distanceMeters: goalEvent.distanceMeters ?? null,
      estimatedDurationMinutes: goalMinutesForLeg(goalEvent, d),
      source: "RACE" as const,
      goalEventId: goalEvent.id,
      multisportGroupId: groupId,
      sessionIndex: i,
    };

    if (existingLeg) {
      await tx.plannedSession.update({ where: { id: legId }, data });
    } else {
      await tx.plannedSession.create({ data: { id: legId, ...data } });
    }
  }

  for (const leg of existing) {
    if (!legIds.includes(leg.id)) {
      await tx.plannedSession.delete({ where: { id: leg.id } });
    }
  }

  const primaryId = legIds[0]!;
  await tx.goalEvent.update({
    where: { id: goalEvent.id },
    data: { plannedSessionId: primaryId },
  });
}

export async function unlinkRaceFromCalendar(
  tx: Tx,
  goalEventId: string,
  options: { deleteSessions: boolean }
): Promise<void> {
  const sessions = await sessionsForGoalEvent(tx, goalEventId);
  const groupIds = new Set(
    sessions.map((s) => s.multisportGroupId).filter((id): id is string => id != null)
  );

  if (options.deleteSessions) {
    for (const s of sessions) {
      await tx.plannedSession.delete({ where: { id: s.id } });
    }
    for (const gid of groupIds) {
      const siblings = await sessionsByMultisportGroup(tx, gid);
      for (const s of siblings) {
        if (!sessions.some((x) => x.id === s.id)) {
          await tx.plannedSession.delete({ where: { id: s.id } });
        }
      }
    }
  } else {
    for (const s of sessions) {
      await tx.plannedSession.update({
        where: { id: s.id },
        data: { goalEventId: null },
      });
    }
  }

  await tx.goalEvent.update({
    where: { id: goalEventId },
    data: { plannedSessionId: null },
  });
}

export async function linkCalendarRaceToGoalEvent(
  tx: Tx,
  params: {
    athleteId: string;
    seasonPlanId: string;
    goalEventId: string;
    plannedSessionId: string;
    priority: "A" | "B" | "C";
    name: string;
    date: Date;
    disciplines: GoalEventDiscipline[];
    distanceMeters?: number | null;
    estimatedDurationMinutes?: number | null;
    notes?: string | null;
  }
): Promise<void> {
  const session = await tx.plannedSession.findFirst({
    where: { id: params.plannedSessionId, athleteId: params.athleteId, source: "RACE" },
  });
  if (!session) {
    throw new Error("Race session not found on calendar");
  }

  const groupSessions = session.multisportGroupId
    ? await sessionsByMultisportGroup(tx, session.multisportGroupId)
    : [session];

  await tx.goalEvent.update({
    where: { id: params.goalEventId },
    data: {
      name: params.name,
      date: params.date,
      disciplines: params.disciplines,
      priority: params.priority,
      distanceMeters: params.distanceMeters ?? null,
      estimatedDurationMinutes: params.estimatedDurationMinutes ?? null,
      notes: params.notes ?? null,
      plannedSessionId: session.id,
    },
  });

  for (const leg of groupSessions) {
    await tx.plannedSession.update({
      where: { id: leg.id },
      data: {
        goalEventId: params.goalEventId,
        title: params.name,
        scheduledDate: params.date,
        distanceMeters: params.distanceMeters ?? leg.distanceMeters,
        estimatedDurationMinutes:
          params.estimatedDurationMinutes ?? leg.estimatedDurationMinutes,
      },
    });
  }
}

export type CreateRaceSessionInput = {
  athleteId: string;
  scheduledDate: Date;
  name: string;
  disciplines: GoalEventDiscipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  notes?: string | null;
};

export async function createRaceSessionsOnCalendar(
  tx: Tx,
  input: CreateRaceSessionInput
): Promise<PlannedSession[]> {
  const disciplines = orderedDisciplines(input.disciplines);
  if (disciplines.length === 0) {
    throw new Error("At least one discipline is required for a race");
  }

  if (disciplines.length === 1) {
    const session = await tx.plannedSession.create({
      data: {
        athleteId: input.athleteId,
        scheduledDate: input.scheduledDate,
        discipline: disciplineToEnum(disciplines[0]!),
        title: input.name,
        notes: input.notes ?? null,
        distanceMeters: input.distanceMeters ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        source: "RACE",
      },
    });
    return [session];
  }

  const groupId = cuid();
  const legs: PlannedSession[] = [];
  for (let i = 0; i < disciplines.length; i++) {
    const leg = await tx.plannedSession.create({
      data: {
        athleteId: input.athleteId,
        scheduledDate: input.scheduledDate,
        discipline: disciplineToEnum(disciplines[i]!),
        title: input.name,
        notes: input.notes ?? null,
        distanceMeters: input.distanceMeters ?? null,
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        source: "RACE",
        multisportGroupId: groupId,
        sessionIndex: i,
      },
    });
    legs.push(leg);
  }
  return legs;
}

export function goalEventDisciplinesFromSession(
  session: PlannedSession,
  siblings: PlannedSession[]
): GoalEventDiscipline[] {
  const all = siblings.length > 0 ? siblings : [session];
  return orderedDisciplines(
    all.map((s) => s.discipline as GoalEventDiscipline)
  );
}

export { orderedDisciplines, isMultisport };
