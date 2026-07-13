import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoalEventDiscipline, PlannedSession, Prisma } from "@prisma/client";
import { syncGoalEventsByPriority } from "./goal-events-sync";

type Tx = Prisma.TransactionClient;

function session(
  partial: Partial<PlannedSession> & Pick<PlannedSession, "id">
): PlannedSession {
  return {
    athleteId: "athlete_1",
    scheduledDate: new Date("2026-09-01"),
    discipline: "RUN",
    title: "Race",
    notes: null,
    distanceMeters: null,
    estimatedDurationMinutes: null,
    source: "RACE",
    goalEventId: null,
    multisportGroupId: null,
    sessionIndex: null,
    linkedActivityId: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
    poolSize: null,
    targetZones: null,
    templateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as PlannedSession;
}

function createMockTx() {
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

  const plannedSessions = new Map<string, PlannedSession>();
  const goalEvents = new Map<
    string,
    {
      id: string;
      athleteId: string;
      seasonPlanId: string;
      name: string;
      date: Date;
      disciplines: GoalEventDiscipline[];
      priority: "A" | "B" | "C";
      distanceMeters: number | null;
      estimatedDurationMinutes: number | null;
      taperDaysBefore: number | null;
      notes: string | null;
      plannedSessionId: string | null;
    }
  >();

  const tx = {
    plannedSession: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { goalEventId?: string; multisportGroupId?: string };
        orderBy?: { sessionIndex?: "asc"; id?: "asc" }[];
      }) => {
        let rows = [...plannedSessions.values()];
        if (where.goalEventId != null) {
          rows = rows.filter((s) => s.goalEventId === where.goalEventId);
        }
        if (where.multisportGroupId != null) {
          rows = rows.filter((s) => s.multisportGroupId === where.multisportGroupId);
        }
        if (orderBy) {
          rows.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
        }
        return rows;
      },
      findFirst: async () => null,
      create: async ({ data }: { data: Partial<PlannedSession> & { id?: string } }) => {
        const id = data.id ?? nextId("ps");
        const row = session({ ...data, id });
        plannedSessions.set(id, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<PlannedSession>;
      }) => {
        const existing = plannedSessions.get(where.id);
        assert.ok(existing);
        const updated = session({ ...existing, ...data, id: where.id });
        plannedSessions.set(where.id, updated);
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        plannedSessions.delete(where.id);
      },
    },
    goalEvent: {
      create: async ({
        data,
      }: {
        data: {
          id: string;
          athleteId: string;
          seasonPlanId: string;
          name: string;
          date: Date;
          disciplines: GoalEventDiscipline[];
          priority: "A" | "B" | "C";
          distanceMeters?: number | null;
          estimatedDurationMinutes?: number | null;
          taperDaysBefore?: number | null;
          notes?: string | null;
        };
      }) => {
        goalEvents.set(data.id, {
          ...data,
          distanceMeters: data.distanceMeters ?? null,
          estimatedDurationMinutes: data.estimatedDurationMinutes ?? null,
          taperDaysBefore: data.taperDaysBefore ?? null,
          notes: data.notes ?? null,
          plannedSessionId: null,
        });
        return goalEvents.get(data.id)!;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = goalEvents.get(where.id);
        assert.ok(existing);
        goalEvents.set(where.id, { ...existing, ...data } as typeof existing);
        return goalEvents.get(where.id)!;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        goalEvents.delete(where.id);
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = goalEvents.get(where.id);
        assert.ok(row);
        return row;
      },
    },
    seasonPlan: {
      update: async () => ({}),
    },
  };

  return {
    tx: tx as unknown as Tx,
    goalEvents,
    plannedSessions,
  };
}

describe("syncGoalEventsByPriority", () => {
  it("persists multiple B races with calendar sessions", async () => {
    const { tx, goalEvents, plannedSessions } = createMockTx();

    await syncGoalEventsByPriority(tx, {
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      priority: "B",
      existingIds: [],
      inputs: [
        {
          name: "B Race 1",
          date: new Date("2026-06-01"),
          disciplines: ["RUN"],
          distanceMeters: 10000,
        },
        {
          name: "B Race 2",
          date: new Date("2026-08-01"),
          disciplines: ["BIKE"],
          distanceMeters: 40000,
        },
      ],
    });

    const bRaces = [...goalEvents.values()].filter((g) => g.priority === "B");
    assert.equal(bRaces.length, 2);
    assert.equal(plannedSessions.size, 2);
    assert.ok([...plannedSessions.values()].every((s) => s.source === "RACE"));
  });

  it("removes dropped C races and their calendar sessions", async () => {
    const { tx, goalEvents, plannedSessions } = createMockTx();
    goalEvents.set("ge_c1", {
      id: "ge_c1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Old C",
      date: new Date("2026-05-01"),
      disciplines: ["RUN"],
      priority: "C",
      distanceMeters: null,
      estimatedDurationMinutes: null,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: "ps_c1",
    });
    plannedSessions.set(
      "ps_c1",
      session({ id: "ps_c1", goalEventId: "ge_c1", source: "RACE" })
    );

    await syncGoalEventsByPriority(tx, {
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      priority: "C",
      existingIds: ["ge_c1"],
      inputs: [],
    });

    assert.equal(goalEvents.has("ge_c1"), false);
    assert.equal(plannedSessions.has("ps_c1"), false);
  });
});
