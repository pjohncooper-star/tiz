import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParsedPlannedSessionImport } from "@/lib/plan/csv-import";
import {
  buildTrainingPlanDraft,
  deepCopyWorkoutSteps,
  recomputeTrainingPlanAggregates,
  resolveApplyWindow,
  schedulePlanSessions,
  weekdayFromDateKey,
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
