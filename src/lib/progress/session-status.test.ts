import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPlannedSession,
  resolvePlannedSessionCompletion,
} from "./session-status";
import { plannedSession } from "./test-fixtures";

const linked = {
  id: "act-1",
  name: "Run",
  startTime: "2026-08-17T14:00:00.000Z",
  durationSeconds: 3600,
  elapsedSeconds: 3600,
  movingSeconds: null,
  distanceMeters: 10000,
  zoneMinutes: 0,
  discipline: "RUN",
  legType: null,
};

describe("resolvePlannedSessionCompletion", () => {
  it("is not done without a link, override, or matched extra", () => {
    const result = resolvePlannedSessionCompletion(plannedSession({ id: "s", title: "Run" }));
    assert.deepEqual(result, { isDone: false, completedMinutes: null });
  });

  it("uses linked activity duration", () => {
    const result = resolvePlannedSessionCompletion(
      plannedSession({ id: "s", title: "Run", linkedActivity: linked })
    );
    assert.deepEqual(result, { isDone: true, completedMinutes: 60 });
  });

  it("uses a manual completion override duration", () => {
    const result = resolvePlannedSessionCompletion(
      plannedSession({
        id: "s",
        title: "Run",
        hasCompletedOverride: true,
        completedDurationMinutes: 42,
      })
    );
    assert.deepEqual(result, { isDone: true, completedMinutes: 42 });
  });

  it("uses a matched unlinked activity", () => {
    const result = resolvePlannedSessionCompletion(
      plannedSession({ id: "s", title: "Run" }),
      1800
    );
    assert.deepEqual(result, { isDone: true, completedMinutes: 30 });
  });
});

describe("classifyPlannedSession", () => {
  const done = (completedMinutes: number | null) => ({ isDone: true, completedMinutes });
  const notDone = { isDone: false, completedMinutes: null };

  it("is upcoming today and in the future, missed in the past", () => {
    const base = { todayKey: "2026-08-17", plannedMinutes: 60, completion: notDone };
    assert.equal(classifyPlannedSession({ ...base, dateKey: "2026-08-16" }), "missed");
    assert.equal(classifyPlannedSession({ ...base, dateKey: "2026-08-17" }), "upcoming");
    assert.equal(classifyPlannedSession({ ...base, dateKey: "2026-08-18" }), "upcoming");
  });

  it("flags short completions as partial", () => {
    const base = { dateKey: "2026-08-16", todayKey: "2026-08-17", plannedMinutes: 60 };
    assert.equal(classifyPlannedSession({ ...base, completion: done(44) }), "partial");
    assert.equal(classifyPlannedSession({ ...base, completion: done(45) }), "done");
    assert.equal(classifyPlannedSession({ ...base, completion: done(90) }), "done");
  });

  it("treats a done session with unknown duration as done", () => {
    assert.equal(
      classifyPlannedSession({
        dateKey: "2026-08-16",
        todayKey: "2026-08-17",
        plannedMinutes: 60,
        completion: done(null),
      }),
      "done"
    );
  });
});
