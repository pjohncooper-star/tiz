import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeekProgress, weekStateFor } from "./week-progress";
import { plannedSession, progressActivity, weekTarget } from "./test-fixtures";

const WEEK = "2026-08-17";
const TODAY_AFTER = "2026-08-24";

const linkedRun = (id: string, minutes: number) => ({
  id,
  name: "Run",
  startTime: "2026-08-18T14:00:00.000Z",
  durationSeconds: minutes * 60,
  elapsedSeconds: minutes * 60,
  movingSeconds: null,
  distanceMeters: 10000,
  zoneMinutes: minutes,
  discipline: "RUN",
  legType: null,
});

describe("weekStateFor", () => {
  it("classifies weeks relative to today's Monday", () => {
    assert.equal(weekStateFor("2026-08-10", "2026-08-19"), "past");
    assert.equal(weekStateFor("2026-08-17", "2026-08-19"), "current");
    assert.equal(weekStateFor("2026-08-24", "2026-08-19"), "future");
  });
});

describe("buildWeekProgress", () => {
  it("compares target, planned, and completed volume for a past week", () => {
    const target = weekTarget({
      weekStart: WEEK,
      zoneMinutes: { "RUN-1": 90, "RUN-4": 30, "BIKE-2": 120 },
    });
    const sessions = [
      plannedSession({
        id: "run-1",
        title: "Easy run",
        discipline: "RUN",
        scheduledDate: "2026-08-18",
        plannedMinutes: 60,
        zoneMinutes: { "RUN-1": 60 },
        linkedActivity: linkedRun("act-run", 60),
      }),
      plannedSession({
        id: "ride-1",
        title: "Long ride",
        discipline: "BIKE",
        scheduledDate: "2026-08-19",
        plannedMinutes: 120,
        zoneMinutes: { "BIKE-2": 120 },
      }),
    ];
    const activities = [
      progressActivity({
        id: "act-run",
        name: "Run",
        dateKey: "2026-08-18",
        durationSeconds: 3600,
        zoneMinutes: { "RUN-1": 50, "RUN-4": 10 },
      }),
      progressActivity({
        id: "act-swim",
        name: "Pool swim",
        discipline: "SWIM",
        dateKey: "2026-08-20",
        durationSeconds: 1800,
        zoneMinutes: { "SWIM-2": 30 },
      }),
    ];

    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target,
      sessions,
      activities,
    });

    assert.equal(progress.state, "past");
    assert.equal(progress.totals.targetMinutes, 360);
    assert.equal(progress.totals.plannedMinutes, 180);
    assert.equal(progress.totals.completedMinutes, 90);
    assert.equal(progress.totals.volumePercent, 25);

    const run = progress.bySport.find((s) => s.discipline === "RUN")!;
    assert.equal(run.targetMinutes, 120);
    assert.equal(run.completedMinutes, 60);
    assert.equal(run.volumePercent, 50);
    assert.deepEqual(run.actualZones, [50, 0, 0, 10, 0]);
    assert.deepEqual(run.targetZones, [90, 0, 0, 30, 0]);

    assert.equal(progress.counts.planned, 2);
    assert.equal(progress.counts.done, 1);
    assert.equal(progress.counts.missed, 1);
    assert.equal(progress.counts.extra, 1);
    assert.equal(progress.adherencePercent, 50);

    const statuses = Object.fromEntries(progress.sessions.map((r) => [r.id, r.status]));
    assert.deepEqual(statuses, {
      "run-1": "done",
      "ride-1": "missed",
      "act-swim": "extra",
    });
  });

  it("counts a linked activity that also has a completion override only once", () => {
    const sessions = [
      plannedSession({
        id: "run-1",
        title: "Run",
        scheduledDate: "2026-08-18",
        hasCompletedOverride: true,
        completedDurationMinutes: 45,
        linkedActivity: linkedRun("act-run", 60),
      }),
    ];
    const activities = [
      progressActivity({ id: "act-run", name: "Run", dateKey: "2026-08-18", durationSeconds: 3600 }),
    ];
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target: null,
      sessions,
      activities,
    });
    assert.equal(progress.totals.completedMinutes, 45);
  });

  it("matches an unlinked same-day activity to an open planned session", () => {
    const sessions = [
      plannedSession({ id: "run-1", title: "Run", scheduledDate: "2026-08-18" }),
    ];
    const activities = [
      progressActivity({ id: "act-1", name: "Evening run", dateKey: "2026-08-18" }),
    ];
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target: null,
      sessions,
      activities,
    });
    assert.equal(progress.counts.done, 1);
    assert.equal(progress.counts.extra, 0);
    assert.equal(progress.sessions.length, 1);
    assert.equal(progress.sessions[0]!.activityId, "act-1");
  });

  it("marks short completions partial and counts them toward adherence", () => {
    const sessions = [
      plannedSession({
        id: "run-1",
        title: "Run",
        scheduledDate: "2026-08-18",
        plannedMinutes: 60,
        linkedActivity: linkedRun("act-run", 30),
      }),
    ];
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target: null,
      sessions,
      activities: [],
    });
    assert.equal(progress.counts.partial, 1);
    assert.equal(progress.adherencePercent, 100);
  });

  it("keeps today's and future sessions upcoming and out of adherence", () => {
    const sessions = [
      plannedSession({ id: "a", title: "Today", scheduledDate: "2026-08-19" }),
      plannedSession({ id: "b", title: "Later", scheduledDate: "2026-08-21" }),
    ];
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: "2026-08-19",
      target: null,
      sessions,
      activities: [],
    });
    assert.equal(progress.state, "current");
    assert.equal(progress.counts.upcoming, 2);
    assert.equal(progress.adherencePercent, null);
  });

  it("reports no targets or percentages when the week has no season target", () => {
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target: null,
      sessions: [],
      activities: [],
    });
    assert.equal(progress.hasTarget, false);
    assert.equal(progress.totals.targetMinutes, null);
    assert.equal(progress.totals.volumePercent, null);
    assert.equal(progress.totals.zoneMatchPercent, null);
    assert.equal(progress.strength, null);
  });

  it("scores zone match against the zone target", () => {
    const target = weekTarget({
      weekStart: WEEK,
      zoneMinutes: { "RUN-1": 100, "RUN-4": 20 },
    });
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target,
      sessions: [],
      activities: [
        progressActivity({
          id: "act-1",
          name: "Run",
          zoneMinutes: { "RUN-1": 60, "RUN-3": 40 },
        }),
      ],
    });
    assert.equal(progress.totals.zoneMatchPercent, (60 / 120) * 100);
  });

  it("reports strength sessions separately from endurance volume", () => {
    const sessions = [
      plannedSession({
        id: "str-1",
        title: "Gym",
        discipline: "STRENGTH",
        scheduledDate: "2026-08-18",
        plannedMinutes: 45,
        hasCompletedOverride: true,
        completedDurationMinutes: 45,
      }),
    ];
    const progress = buildWeekProgress({
      weekStart: WEEK,
      todayKey: TODAY_AFTER,
      target: weekTarget({ weekStart: WEEK }),
      sessions,
      activities: [],
    });
    assert.equal(progress.totals.completedMinutes, 0);
    assert.equal(progress.strength?.counts.done, 1);
    assert.equal(progress.strength?.completedMinutes, 45);
  });
});
