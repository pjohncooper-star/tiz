import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParsedPlannedSessionImport } from "@/lib/plan/csv-import";
import {
  buildTrainingPlanDraft,
  buildTrainingPlanWeekGrid,
  deepCopyWorkoutSteps,
  recomputeTrainingPlanAggregates,
  resolveApplyWindow,
  resolveApplyWindowWithPauses,
  schedulePlanSessions,
  schedulePlanSessionsWithPauses,
  trainingPlanCellForDayOffset,
  trainingPlanDayOffsetForCell,
  trainingPlanWeekCount,
  weekdayFromDateKey,
  weekdayIndexMonFirst,
} from "@/lib/plan/training-plan";
import { parseDateKey } from "@/lib/dates";
import {
  WORKOUT_TREE_VERSION,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

function session(
  dateKey: string,
  overrides: Partial<ParsedPlannedSessionImport> = {}
): ParsedPlannedSessionImport {
  return {
    scheduledDate: parseDateKey(dateKey),
    scheduledDateKey: dateKey,
    discipline: "RUN",
    title: overrides.title ?? `Run ${dateKey}`,
    notes: null,
    estimatedDurationMinutes: 45,
    distanceMeters: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
    poolSize: null,
    sessionRole: "EASY",
    zoneAllocationMissing: true,
    workoutTree: null,
    ...overrides,
  };
}

describe("weekdayFromDateKey", () => {
  it("maps UTC noon date keys to Weekday", () => {
    assert.equal(weekdayFromDateKey("2026-07-27"), "MON");
    assert.equal(weekdayFromDateKey("2026-07-28"), "TUE");
    assert.equal(weekdayFromDateKey("2026-08-02"), "SUN");
  });
});

describe("buildTrainingPlanDraft", () => {
  it("uses first session day as offset 0 and preserves gaps", () => {
    const draft = buildTrainingPlanDraft([
      session("2026-08-03", { title: "A" }),
      session("2026-08-05", { title: "B" }),
      session("2026-08-10", { title: "C" }),
    ]);
    assert.equal(draft.durationDays, 8);
    assert.equal(draft.sessionCount, 3);
    assert.equal(draft.anchorWeekday, "MON");
    assert.deepEqual(
      draft.sessions.map((s) => s.dayOffset),
      [0, 2, 7]
    );
    assert.equal(draft.gapWarning, false);
    assert.equal(draft.gapBlocked, false);
  });

  it("assigns sortOrder for same-day sessions", () => {
    const draft = buildTrainingPlanDraft([
      session("2026-08-03", { title: "Swim", discipline: "SWIM" }),
      session("2026-08-03", { title: "Bike", discipline: "BIKE" }),
    ]);
    assert.equal(draft.sessions.length, 2);
    assert.equal(draft.sessions[0]!.dayOffset, 0);
    assert.equal(draft.sessions[1]!.dayOffset, 0);
    assert.equal(draft.sessions[0]!.sortOrder, 0);
    assert.equal(draft.sessions[1]!.sortOrder, 1);
  });

  it("flags large gaps", () => {
    const warn = buildTrainingPlanDraft([
      session("2026-08-01"),
      session("2026-08-25"),
    ]);
    assert.equal(warn.gapWarning, true);
    assert.equal(warn.gapBlocked, false);

    const block = buildTrainingPlanDraft([
      session("2026-08-01"),
      session("2026-11-01"),
    ]);
    assert.equal(block.gapBlocked, true);
    assert.ok(block.maxGapDays > 90);
  });

  it("rejects plans longer than 26 weeks", () => {
    assert.throws(
      () =>
        buildTrainingPlanDraft([
          session("2026-01-01"),
          session("2026-07-10"),
        ]),
      /26 weeks/
    );
  });
});

describe("resolveApplyWindow", () => {
  it("start mode spans full duration", () => {
    const w = resolveApplyWindow({
      durationDays: 28,
      anchorMode: "start",
      date: "2026-09-01",
      todayKey: "2026-08-01",
    });
    assert.equal(w.startDate, "2026-09-01");
    assert.equal(w.endDate, "2026-09-28");
    assert.equal(w.truncateOffset, 0);
    assert.equal(w.truncated, false);
  });

  it("end mode uses ideal start when not past", () => {
    const w = resolveApplyWindow({
      durationDays: 28,
      anchorMode: "end",
      date: "2026-09-28",
      todayKey: "2026-08-01",
    });
    assert.equal(w.startDate, "2026-09-01");
    assert.equal(w.endDate, "2026-09-28");
    assert.equal(w.truncated, false);
  });

  it("end mode truncates from the start when ideal start is before today", () => {
    const w = resolveApplyWindow({
      durationDays: 28,
      anchorMode: "end",
      date: "2026-09-28",
      todayKey: "2026-09-11",
    });
    assert.equal(w.startDate, "2026-09-11");
    assert.equal(w.endDate, "2026-09-28");
    assert.equal(w.truncateOffset, 10);
    assert.equal(w.truncated, true);
    assert.equal(w.appliedDurationDays, 18);
  });

  it("rejects end date before today", () => {
    assert.throws(
      () =>
        resolveApplyWindow({
          durationDays: 14,
          anchorMode: "end",
          date: "2026-08-01",
          todayKey: "2026-08-10",
        }),
      /today or later/
    );
  });
});

describe("schedulePlanSessions", () => {
  it("keeps plan suffix after truncation", () => {
    const window = resolveApplyWindow({
      durationDays: 10,
      anchorMode: "end",
      date: "2026-08-20",
      todayKey: "2026-08-15",
    });
    // ideal start = Aug 11; today Aug 15 → truncateOffset 4
    assert.equal(window.truncateOffset, 4);
    const scheduled = schedulePlanSessions(
      [
        { dayOffset: 0, sortOrder: 0 },
        { dayOffset: 4, sortOrder: 0 },
        { dayOffset: 9, sortOrder: 0 },
      ],
      window
    );
    assert.deepEqual(
      scheduled.map((s) => s.scheduledDateKey),
      ["2026-08-15", "2026-08-20"]
    );
  });
});

describe("resolveApplyWindowWithPauses", () => {
  it("end-anchors an 8-week plan plus one pause week so the race date stays put", () => {
    const window = resolveApplyWindowWithPauses({
      durationDays: 56,
      anchorMode: "end",
      date: "2026-09-27",
      todayKey: "2026-01-01",
      pausedWeeks: [{ weekStartDate: "2026-08-24", weekCount: 1 }],
    });
    assert.equal(window.appliedDurationDays, 63);
    assert.equal(window.startDate, "2026-07-27");
    assert.equal(window.endDate, "2026-09-27");
    assert.deepEqual(window.pausedMondays, ["2026-08-24"]);
    assert.equal(window.truncated, false);
  });

  it("start-anchors by sliding the end later", () => {
    const window = resolveApplyWindowWithPauses({
      durationDays: 56,
      anchorMode: "start",
      date: "2026-08-03",
      todayKey: "2026-01-01",
      pausedWeeks: [{ weekStartDate: "2026-08-24", weekCount: 1 }],
    });
    assert.equal(window.startDate, "2026-08-03");
    assert.equal(window.endDate, "2026-10-04");
    assert.deepEqual(window.pausedMondays, ["2026-08-24"]);
  });

  it("drops pause weeks that fall outside the resolved window", () => {
    const window = resolveApplyWindowWithPauses({
      durationDays: 14,
      anchorMode: "end",
      date: "2026-09-27",
      todayKey: "2026-01-01",
      pausedWeeks: [{ weekStartDate: "2026-01-05", weekCount: 1 }],
    });
    assert.equal(window.appliedDurationDays, 14);
    assert.deepEqual(window.pausedMondays, []);
  });
});

describe("schedulePlanSessionsWithPauses", () => {
  it("skips the paused week and keeps weekday alignment", () => {
    const window = resolveApplyWindowWithPauses({
      durationDays: 56,
      anchorMode: "end",
      date: "2026-09-27",
      todayKey: "2026-01-01",
      pausedWeeks: [{ weekStartDate: "2026-08-24", weekCount: 1 }],
    });
    const scheduled = schedulePlanSessionsWithPauses(
      [
        { dayOffset: 0, sortOrder: 0 },
        { dayOffset: 1, sortOrder: 0 },
        { dayOffset: 21, sortOrder: 0 },
        { dayOffset: 28, sortOrder: 0 },
        { dayOffset: 55, sortOrder: 0 },
      ],
      window,
      window.pausedMondays
    );
    assert.deepEqual(
      scheduled.map((s) => s.scheduledDateKey),
      ["2026-07-27", "2026-07-28", "2026-08-17", "2026-08-31", "2026-09-27"]
    );
  });

  it("places no sessions on a paused week", () => {
    const window = resolveApplyWindowWithPauses({
      durationDays: 14,
      anchorMode: "start",
      date: "2026-08-03",
      todayKey: "2026-01-01",
      pausedWeeks: [{ weekStartDate: "2026-08-10", weekCount: 1 }],
    });
    const scheduled = schedulePlanSessionsWithPauses(
      [
        { dayOffset: 0, sortOrder: 0 },
        { dayOffset: 7, sortOrder: 0 },
      ],
      window,
      window.pausedMondays
    );
    assert.equal(scheduled[0]!.scheduledDateKey, "2026-08-03");
    assert.equal(scheduled[1]!.scheduledDateKey, "2026-08-17");
    assert.ok(
      scheduled.every(
        (s) =>
          s.scheduledDateKey < "2026-08-10" || s.scheduledDateKey > "2026-08-16"
      )
    );
  });
});

describe("recomputeTrainingPlanAggregates", () => {
  it("uses max dayOffset + 1 for duration", () => {
    assert.deepEqual(
      recomputeTrainingPlanAggregates([
        { dayOffset: 0 },
        { dayOffset: 2 },
        { dayOffset: 9 },
      ]),
      { sessionCount: 3, durationDays: 10 }
    );
  });

  it("allows sparse single-session packs", () => {
    assert.deepEqual(recomputeTrainingPlanAggregates([{ dayOffset: 5 }]), {
      sessionCount: 1,
      durationDays: 6,
    });
  });
});

describe("training plan week grid mapping", () => {
  it("indexes weekdays Monday-first", () => {
    assert.equal(weekdayIndexMonFirst("MON"), 0);
    assert.equal(weekdayIndexMonFirst("TUE"), 1);
    assert.equal(weekdayIndexMonFirst("SUN"), 6);
  });

  it("places dayOffset 0 on the Tuesday column when the plan starts Tuesday", () => {
    assert.deepEqual(trainingPlanCellForDayOffset("TUE", 0), { week: 0, col: 1 });
    assert.deepEqual(trainingPlanCellForDayOffset("TUE", 5), { week: 0, col: 6 });
    assert.deepEqual(trainingPlanCellForDayOffset("TUE", 6), { week: 1, col: 0 });
  });

  it("places Monday-start offset 0 in the first cell", () => {
    assert.deepEqual(trainingPlanCellForDayOffset("MON", 0), { week: 0, col: 0 });
    assert.deepEqual(trainingPlanCellForDayOffset("MON", 7), { week: 1, col: 0 });
  });

  it("returns null for cells before the plan start", () => {
    assert.equal(trainingPlanDayOffsetForCell("TUE", 0, 0), null);
    assert.equal(trainingPlanDayOffsetForCell("TUE", 0, 1), 0);
    assert.equal(trainingPlanDayOffsetForCell("TUE", 1, 0), 6);
  });

  it("covers duration spanning into a second week when starting Tuesday", () => {
    assert.equal(trainingPlanWeekCount("TUE", 10), 2);
    assert.equal(trainingPlanWeekCount("MON", 7), 1);
    assert.equal(trainingPlanWeekCount("MON", 8), 2);
  });

  it("stacks same-day sessions and leaves pre-start Monday empty", () => {
    const rows = buildTrainingPlanWeekGrid("TUE", 8, [
      { id: "a", dayOffset: 0, sortOrder: 1, title: "Second" },
      { id: "b", dayOffset: 0, sortOrder: 0, title: "First" },
      { id: "c", dayOffset: 6, sortOrder: 0, title: "Next Mon" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]![0]!.dayOffset, null);
    assert.equal(rows[0]![0]!.sessions.length, 0);
    assert.deepEqual(
      rows[0]![1]!.sessions.map((s) => s.id),
      ["b", "a"]
    );
    assert.equal(rows[1]![0]!.dayOffset, 6);
    assert.equal(rows[1]![0]!.sessions[0]!.id, "c");
  });
});

describe("from-calendar intensity copy", () => {
  it("preserves relative and absolute trees through draft + deepCopy", () => {
    const relativeTree: WorkoutTreeDocument = {
      version: WORKOUT_TREE_VERSION,
      nodes: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 600 },
          target: {
            signal: "pace",
            mode: "relative",
            ref: "10k",
            pct: 95,
            refSource: "fitness",
          },
        },
      ],
    };
    const absoluteTree: WorkoutTreeDocument = {
      version: WORKOUT_TREE_VERSION,
      nodes: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 600 },
          target: {
            signal: "pace",
            mode: "value",
            value: 270,
          },
          targetPaceSeconds: 270,
        },
      ],
    };

    const draft = buildTrainingPlanDraft([
      session("2026-08-03", { title: "Rel", workoutTree: relativeTree }),
      session("2026-08-04", { title: "Abs", workoutTree: absoluteTree }),
    ]);

    const relCopy = deepCopyWorkoutSteps(draft.sessions[0]!.steps);
    const absCopy = deepCopyWorkoutSteps(draft.sessions[1]!.steps);
    assert.equal(relCopy?.nodes[0]?.kind, "step");
    if (relCopy?.nodes[0]?.kind === "step") {
      assert.equal(relCopy.nodes[0].target.mode, "relative");
      assert.equal(relCopy.nodes[0].target.ref, "10k");
    }
    assert.equal(absCopy?.nodes[0]?.kind, "step");
    if (absCopy?.nodes[0]?.kind === "step") {
      assert.equal(absCopy.nodes[0].target.mode, "value");
      assert.equal(absCopy.nodes[0].target.value, 270);
    }
  });
});
