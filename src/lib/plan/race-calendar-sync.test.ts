import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoalEventDiscipline, PlannedSession, Prisma } from "@prisma/client";
import {
  createRaceSessionsOnCalendar,
  goalEventDisciplinesFromSession,
  isMultisport,
  orderedDisciplines,
  syncRaceToCalendar,
  unlinkRaceFromCalendar,
} from "./race-calendar-sync";

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
    anchorWorkoutId: null,
    templateId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as PlannedSession;
}

function createMockTx() {
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
        where: {
          goalEventId?: string;
          multisportGroupId?: string;
        };
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
          rows.sort((a, b) => {
            const ai = a.sessionIndex ?? 0;
            const bi = b.sessionIndex ?? 0;
            if (ai !== bi) return ai - bi;
            return a.id.localeCompare(b.id);
          });
        }
        return rows;
      },
      findFirst: async ({ where }: { where: { id?: string; athleteId?: string; source?: string } }) => {
        return (
          [...plannedSessions.values()].find(
            (s) =>
              (where.id == null || s.id === where.id) &&
              (where.athleteId == null || s.athleteId === where.athleteId) &&
              (where.source == null || s.source === where.source)
          ) ?? null
        );
      },
      create: async ({ data }: { data: Partial<PlannedSession> & { id?: string } }) => {
        const id = data.id ?? `ps_${plannedSessions.size + 1}`;
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
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<{
          plannedSessionId: string | null;
        }>;
      }) => {
        const existing = goalEvents.get(where.id);
        assert.ok(existing);
        goalEvents.set(where.id, { ...existing, ...data });
        return goalEvents.get(where.id)!;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = goalEvents.get(where.id);
        assert.ok(row);
        return row;
      },
    },
  };

  return {
    tx: tx as unknown as Tx,
    plannedSessions,
    goalEvents,
    seedGoalEvent(id: string, disciplines: GoalEventDiscipline[]) {
      goalEvents.set(id, {
        id,
        athleteId: "athlete_1",
        seasonPlanId: "season_1",
        name: "Test Race",
        date: new Date("2026-09-01"),
        disciplines,
        priority: "A",
        distanceMeters: 42195,
        estimatedDurationMinutes: 210,
        taperDaysBefore: null,
        notes: null,
        plannedSessionId: null,
      });
    },
  };
}

describe("orderedDisciplines", () => {
  it("orders swim bike run regardless of input order", () => {
    assert.deepEqual(orderedDisciplines(["RUN", "SWIM", "BIKE"]), ["SWIM", "BIKE", "RUN"]);
  });
});

describe("isMultisport", () => {
  it("is false for single discipline", () => {
    assert.equal(isMultisport(["RUN"]), false);
  });

  it("is true for tri", () => {
    assert.equal(isMultisport(["SWIM", "BIKE", "RUN"]), true);
  });
});

describe("goalEventDisciplinesFromSession", () => {
  it("returns ordered disciplines from siblings", () => {
    const swim = session({ id: "s1", discipline: "SWIM", sessionIndex: 0 });
    const bike = session({ id: "s2", discipline: "BIKE", sessionIndex: 1 });
    const run = session({ id: "s3", discipline: "RUN", sessionIndex: 2 });
    assert.deepEqual(goalEventDisciplinesFromSession(swim, [swim, bike, run]), [
      "SWIM",
      "BIKE",
      "RUN",
    ]);
  });
});

describe("syncRaceToCalendar", () => {
  it("creates a single RACE session for run-only goal event", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_1", {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Marathon",
      date: new Date("2026-09-01"),
      disciplines: ["RUN"],
      priority: "A",
      distanceMeters: 42195,
      estimatedDurationMinutes: 210,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: null,
    });

    await syncRaceToCalendar(tx, {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Marathon",
      date: new Date("2026-09-01"),
      disciplines: ["RUN"],
      priority: "A",
      distanceMeters: 42195,
      estimatedDurationMinutes: 210,
    });

    assert.equal(plannedSessions.size, 1);
    const ps = [...plannedSessions.values()][0]!;
    assert.equal(ps.source, "RACE");
    assert.equal(ps.discipline, "RUN");
    assert.equal(ps.goalEventId, "ge_1");
    assert.equal(goalEvents.get("ge_1")!.plannedSessionId, ps.id);
  });

  it("creates three legs with shared multisportGroupId for tri", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_tri", {
      id: "ge_tri",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Ironman",
      date: new Date("2026-07-15"),
      disciplines: ["SWIM", "BIKE", "RUN"],
      priority: "A",
      distanceMeters: null,
      estimatedDurationMinutes: 600,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: null,
    });

    await syncRaceToCalendar(tx, {
      id: "ge_tri",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Ironman",
      date: new Date("2026-07-15"),
      disciplines: ["SWIM", "BIKE", "RUN"],
      priority: "A",
      estimatedDurationMinutes: 600,
    });

    assert.equal(plannedSessions.size, 3);
    const legs = [...plannedSessions.values()].sort(
      (a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)
    );
    const groupId = legs[0]!.multisportGroupId;
    assert.ok(groupId);
    assert.ok(legs.every((l) => l.multisportGroupId === groupId));
    assert.deepEqual(
      legs.map((l) => l.discipline),
      ["SWIM", "BIKE", "RUN"]
    );
    assert.equal(goalEvents.get("ge_tri")!.plannedSessionId, legs[0]!.id);
  });

  it("applies per-leg goal minutes to multisport calendar sessions", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_703", {
      id: "ge_703",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "70.3",
      date: new Date("2026-08-01"),
      disciplines: ["SWIM", "BIKE", "RUN"],
      priority: "A",
      distanceMeters: null,
      estimatedDurationMinutes: 300,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: null,
    });

    await syncRaceToCalendar(tx, {
      id: "ge_703",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "70.3",
      date: new Date("2026-08-01"),
      disciplines: ["SWIM", "BIKE", "RUN"],
      priority: "A",
      estimatedDurationMinutes: 300,
      swimGoalMinutes: 30,
      bikeGoalMinutes: 180,
      runGoalMinutes: 90,
    });

    const legs = [...plannedSessions.values()].sort(
      (a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0)
    );
    assert.deepEqual(
      legs.map((l) => l.estimatedDurationMinutes),
      [30, 180, 90]
    );
  });

  it("moves session date on update", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_1", {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "10K",
      date: new Date("2026-09-01"),
      disciplines: ["RUN"],
      priority: "B",
      distanceMeters: 10000,
      estimatedDurationMinutes: 45,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: "ps_existing",
    });
    plannedSessions.set(
      "ps_existing",
      session({
        id: "ps_existing",
        goalEventId: "ge_1",
        scheduledDate: new Date("2026-09-01"),
        discipline: "RUN",
        title: "10K",
        source: "RACE",
      })
    );

    await syncRaceToCalendar(tx, {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "10K",
      date: new Date("2026-09-15"),
      disciplines: ["RUN"],
      priority: "B",
      distanceMeters: 10000,
      estimatedDurationMinutes: 45,
    });

    assert.equal(
      plannedSessions.get("ps_existing")!.scheduledDate.toISOString().slice(0, 10),
      "2026-09-15"
    );
  });
});

describe("unlinkRaceFromCalendar", () => {
  it("plan-only delete clears goalEventId but keeps session", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_1", {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Race",
      date: new Date("2026-09-01"),
      disciplines: ["RUN"],
      priority: "C",
      distanceMeters: null,
      estimatedDurationMinutes: null,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: "ps_1",
    });
    plannedSessions.set(
      "ps_1",
      session({ id: "ps_1", goalEventId: "ge_1", source: "RACE" })
    );

    await unlinkRaceFromCalendar(tx, "ge_1", { deleteSessions: false });

    assert.equal(plannedSessions.get("ps_1")!.goalEventId, null);
    assert.equal(plannedSessions.get("ps_1")!.source, "RACE");
    assert.equal(goalEvents.get("ge_1")!.plannedSessionId, null);
  });

  it("delete plan+calendar removes sessions", async () => {
    const { tx, plannedSessions, goalEvents } = createMockTx();
    goalEvents.set("ge_1", {
      id: "ge_1",
      athleteId: "athlete_1",
      seasonPlanId: "season_1",
      name: "Race",
      date: new Date("2026-09-01"),
      disciplines: ["RUN"],
      priority: "C",
      distanceMeters: null,
      estimatedDurationMinutes: null,
      taperDaysBefore: null,
      notes: null,
      plannedSessionId: "ps_1",
    });
    plannedSessions.set(
      "ps_1",
      session({ id: "ps_1", goalEventId: "ge_1", source: "RACE" })
    );

    await unlinkRaceFromCalendar(tx, "ge_1", { deleteSessions: true });

    assert.equal(plannedSessions.has("ps_1"), false);
  });
});

describe("createRaceSessionsOnCalendar", () => {
  it("creates unlinked calendar race without goal event", async () => {
    const { tx, plannedSessions } = createMockTx();

    const legs = await createRaceSessionsOnCalendar(tx, {
      athleteId: "athlete_1",
      scheduledDate: new Date("2026-08-01"),
      name: "Local 5K",
      disciplines: ["RUN"],
      distanceMeters: 5000,
      estimatedDurationMinutes: 25,
    });

    assert.equal(legs.length, 1);
    assert.equal(legs[0]!.source, "RACE");
    assert.equal(legs[0]!.goalEventId, null);
    assert.equal(plannedSessions.size, 1);
  });
});
