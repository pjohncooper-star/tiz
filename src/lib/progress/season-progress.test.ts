import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketProgressInputs, buildSeasonProgress } from "./season-progress";
import { plannedSession, progressActivity, weekTarget } from "./test-fixtures";

const WEEKS = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];

const season = {
  id: "season-1",
  name: "Fall build",
  startDate: "2026-08-03",
  endDate: "2026-08-30",
  totalWeeks: 4,
  phases: [
    { id: "base", name: "Base", color: "#0ea5e9", startWeekIndex: 0, endWeekIndex: 1 },
    { id: "build", name: "Build", color: "#f97316", startWeekIndex: 2, endWeekIndex: 3 },
  ],
  goalEvents: [
    { id: "race", name: "A race", date: "2026-09-13", priority: "A" as const },
  ],
};

const linked = (id: string) => ({
  id,
  name: "Run",
  startTime: "2026-08-10T14:00:00.000Z",
  durationSeconds: 3600,
  elapsedSeconds: 3600,
  movingSeconds: null,
  distanceMeters: 10000,
  zoneMinutes: 60,
  discipline: "RUN",
  legType: null,
});

describe("bucketProgressInputs", () => {
  it("keeps a linked activity in its planned session's week", () => {
    const sessions = [
      plannedSession({
        id: "s1",
        title: "Run",
        scheduledDate: "2026-08-16",
        linkedActivity: linked("act-1"),
      }),
    ];
    const activities = [progressActivity({ id: "act-1", name: "Run", dateKey: "2026-08-17" })];
    const buckets = bucketProgressInputs(sessions, activities);
    assert.equal(buckets.get("2026-08-10")?.activities.length, 1);
    assert.equal(buckets.get("2026-08-17"), undefined);
  });

  it("buckets unlinked activities by their activity-local day", () => {
    const buckets = bucketProgressInputs(
      [],
      [progressActivity({ id: "a", name: "Ride", dateKey: "2026-08-23" })]
    );
    assert.equal(buckets.get("2026-08-17")?.activities.length, 1);
  });
});

describe("buildSeasonProgress", () => {
  const targets = WEEKS.map((weekStart, weekIndex) => weekTarget({ weekStart, weekIndex }));

  it("rolls past weeks into season-to-date and excludes the current week", () => {
    const sessions = [
      plannedSession({
        id: "w0",
        title: "Run",
        scheduledDate: "2026-08-04",
        linkedActivity: linked("a0"),
      }),
      plannedSession({ id: "w1", title: "Run", scheduledDate: "2026-08-11" }),
      plannedSession({ id: "w2", title: "Run", scheduledDate: "2026-08-20" }),
    ];
    const activities = [
      progressActivity({ id: "a0", name: "Run", dateKey: "2026-08-04", durationSeconds: 3600 }),
    ];
    const progress = buildSeasonProgress({
      season,
      weekStarts: WEEKS,
      weekTargets: targets,
      sessions,
      activities,
      todayKey: "2026-08-19",
    });

    assert.deepEqual(
      progress.weeks.map((w) => w.state),
      ["past", "past", "current", "future"]
    );
    assert.equal(progress.currentWeekIndex, 2);
    assert.equal(progress.futureWeeks, 1);
    assert.equal(progress.toDate.weekCount, 2);
    assert.equal(progress.toDate.targetMinutes, 720);
    assert.equal(progress.toDate.completedMinutes, 60);
    assert.equal(progress.toDate.counts.done, 1);
    assert.equal(progress.toDate.counts.missed, 1);
    assert.equal(progress.toDate.adherencePercent, 50);
    assert.equal(progress.weeks[2]!.counts.upcoming, 1);
    assert.ok(!("sessions" in progress.weeks[0]!));
  });

  it("assigns weeks to phases and rolls up each phase", () => {
    const progress = buildSeasonProgress({
      season,
      weekStarts: WEEKS,
      weekTargets: targets,
      sessions: [],
      activities: [],
      todayKey: "2026-08-19",
    });
    assert.equal(progress.weeks[0]!.phaseId, "base");
    assert.equal(progress.weeks[3]!.phaseId, "build");
    const base = progress.phases.find((p) => p.id === "base")!;
    assert.equal(base.state, "past");
    assert.equal(base.pastWeeks, 2);
    assert.equal(base.targetMinutes, 720);
    const build = progress.phases.find((p) => p.id === "build")!;
    assert.equal(build.state, "current");
    assert.equal(build.pastWeeks, 0);
  });

  it("reports days to goal events", () => {
    const progress = buildSeasonProgress({
      season,
      weekStarts: WEEKS,
      weekTargets: targets,
      sessions: [],
      activities: [],
      todayKey: "2026-08-19",
    });
    assert.equal(progress.goalEvents[0]!.daysAway, 25);
  });

  it("has an empty season-to-date before the first week completes", () => {
    const progress = buildSeasonProgress({
      season,
      weekStarts: WEEKS,
      weekTargets: targets,
      sessions: [],
      activities: [],
      todayKey: "2026-08-04",
    });
    assert.equal(progress.toDate.weekCount, 0);
    assert.equal(progress.toDate.volumePercent, null);
    assert.equal(progress.toDate.adherencePercent, null);
  });
});
