import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { zoneKey } from "@/lib/workout/steps";
import { rollupTreeToZoneMinutes, totalTreeDurationMinutes } from "@/lib/workout/workout-tree";
import {
  buildEnduranceDraftNodes,
  buildLongDraftNodes,
  canAutoFillEasyTiz,
  computeEasyTizSpread,
} from "./spread-easy-tiz";
import { treeFromDraft } from "./pool-session-card";

function baseWeekTarget(overrides: Partial<CalendarWeekTarget> = {}): CalendarWeekTarget {
  return {
    weekStart: "2026-07-06",
    weekIndex: 0,
    isRestWeek: false,
    totalHours: 10,
    phase: null,
    strengthSessionsPerWeek: 0,
    planningMode: "BY_DISCIPLINE",
    longRideMinutes: 120,
    longRunMinutes: 90,
    zoneMinutes: {
      "RUN-1": 30,
      "RUN-2": 90,
      "BIKE-1": 40,
      "BIKE-2": 120,
      "SWIM-1": 20,
      "SWIM-2": 40,
    },
    byDiscipline: [
      { discipline: "SWIM", hours: 2, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
      { discipline: "BIKE", hours: 4, zoneMinutes: {}, sessionsPerWeek: 4, intenseDaysPerWeek: 2 },
      { discipline: "RUN", hours: 3, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
    ],
    slotBudgets: {
      SWIM: {
        endurance: 2,
        intensity: 1,
        long: 0,
        substituteEndurance: 0,
        substituteDurationMinutes: 0,
      },
      BIKE: {
        endurance: 2,
        intensity: 2,
        long: 1,
        substituteEndurance: 0,
        substituteDurationMinutes: 0,
      },
      RUN: {
        endurance: 1,
        intensity: 1,
        long: 1,
        substituteEndurance: 0,
        substituteDurationMinutes: 0,
      },
      STRENGTH: {
        endurance: 0,
        intensity: 0,
        long: 0,
        substituteEndurance: 0,
        substituteDurationMinutes: 0,
      },
    },
    ...overrides,
  };
}

function chip(
  id: string,
  discipline: UnscheduledChip["discipline"],
  slotKind: UnscheduledChip["slotKind"],
  targetDurationMinutes?: number
): UnscheduledChip {
  return {
    id,
    discipline,
    slotKind,
    label: `${discipline} ${slotKind}`,
    ...(targetDurationMinutes != null ? { targetDurationMinutes } : {}),
  };
}

function session(
  discipline: CalendarPlannedSession["discipline"],
  zoneMinutes: Record<string, number>,
  overrides: Partial<CalendarPlannedSession> = {}
): CalendarPlannedSession {
  return {
    id: `session-${Math.random()}`,
    scheduledDate: "2026-07-07",
    discipline,
    title: "Session",
    totalMinutes: 60,
    plannedMinutes: 60,
    distanceMeters: null,
    zoneMinutes,
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: false,
    source: "FLEXIBLE",
    poolSize: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: null,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole: "EASY",
    displaySessionRole: "EASY",
    poolSlotKind: "ENDURANCE",
    ...overrides,
  };
}

describe("spread-easy-tiz", () => {
  it("buildLongDraftNodes splits 90 min run into 10/75/5", () => {
    const nodes = buildLongDraftNodes("RUN", 90);
    const rollup = rollupTreeToZoneMinutes({ version: 2, nodes });
    assert.equal(rollup["1"], 15);
    assert.equal(rollup["2"], 75);
    assert.equal(totalTreeDurationMinutes(nodes), 90);
  });

  it("buildLongDraftNodes uses bike warm/cool defaults", () => {
    const nodes = buildLongDraftNodes("BIKE", 120);
    const rollup = rollupTreeToZoneMinutes({ version: 2, nodes });
    assert.equal(rollup["1"], 20);
    assert.equal(rollup["2"], 100);
  });

  it("buildLongDraftNodes clamps short totals by shrinking warm then cool", () => {
    const nodes = buildLongDraftNodes("RUN", 12);
    const rollup = rollupTreeToZoneMinutes({ version: 2, nodes });
    assert.equal(rollup["1"], 12);
    assert.equal(rollup["2"] ?? 0, 0);
    assert.equal(totalTreeDurationMinutes(nodes), 12);
  });

  it("buildEnduranceDraftNodes skips zero legs", () => {
    const nodes = buildEnduranceDraftNodes("RUN", 0, 45);
    assert.equal(nodes.length, 1);
    const rollup = rollupTreeToZoneMinutes({ version: 2, nodes });
    assert.equal(rollup["2"], 45);
  });

  it("distributes remaining Z1/Z2 exactly across endurance cards", () => {
    const weekTarget = baseWeekTarget();
    const chips = [
      chip("run-end-0", "RUN", "ENDURANCE"),
      chip("run-end-1", "RUN", "ENDURANCE"),
    ];
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "ALL",
    });

    assert.equal(Object.keys(generated).length, 2);
    let z1 = 0;
    let z2 = 0;
    for (const draft of Object.values(generated)) {
      const rollup = rollupTreeToZoneMinutes(treeFromDraft(draft));
      z1 += rollup["1"] ?? 0;
      z2 += rollup["2"] ?? 0;
    }
    assert.equal(z1, 30);
    assert.equal(z2, 90);
  });

  it("subtracts scheduled sessions and existing drafts from remaining", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("run-end-0", "RUN", "ENDURANCE")];
    const existingDraft = {
      nodes: buildEnduranceDraftNodes("RUN", 10, 20),
      durationMinutes: 30,
      profile: null,
    };
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [session("RUN", { [zoneKey("RUN", 1)]: 5, [zoneKey("RUN", 2)]: 15 })],
      drafts: { "run-end-0": existingDraft },
      chips,
      disciplineFilter: "ALL",
    });
    assert.equal(Object.keys(generated).length, 0);
  });

  it("excludes long TiZ from main budget in SEPARATE_LONG_TIZ mode", () => {
    const weekTarget = baseWeekTarget({
      planningMode: "SEPARATE_LONG_TIZ",
      zoneMinutes: {
        "RUN-1": 20,
        "RUN-2": 40,
      },
    });
    const chips = [chip("run-end-0", "RUN", "ENDURANCE")];
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [
        session(
          "RUN",
          { [zoneKey("RUN", 1)]: 10, [zoneKey("RUN", 2)]: 30 },
          { sessionRole: "LONG", poolSlotKind: "LONG" }
        ),
      ],
      drafts: {},
      chips,
      disciplineFilter: "ALL",
    });
    const draft = generated["run-end-0"];
    assert.ok(draft);
    const rollup = rollupTreeToZoneMinutes(treeFromDraft(draft));
    assert.equal(rollup["1"], 20);
    assert.equal(rollup["2"], 40);
  });

  it("respects discipline filter", () => {
    const weekTarget = baseWeekTarget();
    const chips = [
      chip("run-end-0", "RUN", "ENDURANCE"),
      chip("bike-end-0", "BIKE", "ENDURANCE"),
    ];
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "RUN",
    });
    assert.equal(Object.keys(generated).length, 1);
    assert.ok(generated["run-end-0"]);
  });

  it("does not create long drafts for swim", () => {
    const weekTarget = baseWeekTarget({
      slotBudgets: {
        ...baseWeekTarget().slotBudgets!,
        SWIM: {
          endurance: 1,
          intensity: 1,
          long: 1,
          substituteEndurance: 0,
          substituteDurationMinutes: 0,
        },
      },
    });
    const chips = [chip("swim-long-0", "SWIM", "LONG")];
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "ALL",
    });
    assert.equal(generated["swim-long-0"], undefined);
  });

  it("derives run distance from pace context", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("run-long-0", "RUN", "LONG", 60)];
    const generated = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "RUN",
      paceContext: {
        RUN: {
          thresholdPaceSeconds: 300,
          zoneBoundaries: zoneBoundariesFor("RUN", "PACE"),
        },
      },
    });
    const draft = generated["run-long-0"];
    assert.ok(draft);
    assert.ok((draft.distanceMeters ?? 0) > 0);
    assert.ok((draft.targetPaceSeconds ?? 0) > 0);
  });

  it("derives bike distance only when bike pace threshold is present", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("bike-long-0", "BIKE", "LONG", 60)];
    const withoutThreshold = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "BIKE",
    });
    assert.equal(withoutThreshold["bike-long-0"]?.distanceMeters, undefined);

    const withThreshold = computeEasyTizSpread({
      weekTarget,
      sessions: [],
      drafts: {},
      chips,
      disciplineFilter: "BIKE",
      paceContext: {
        BIKE: {
          thresholdPaceSeconds: 240,
          zoneBoundaries: zoneBoundariesFor("BIKE", "PACE"),
        },
      },
    });
    const draft = withThreshold["bike-long-0"];
    assert.ok(draft);
    assert.ok((draft.distanceMeters ?? 0) > 0);
    assert.ok((draft.targetSpeedMps ?? 0) > 0);
  });

  it("canAutoFillEasyTiz hides when all fillable cards already have drafts", () => {
    const chips = [chip("run-end-0", "RUN", "ENDURANCE")];
    assert.equal(
      canAutoFillEasyTiz({ chips, drafts: {}, disciplineFilter: "ALL" }),
      true
    );
    assert.equal(
      canAutoFillEasyTiz({
        chips,
        drafts: {
          "run-end-0": {
            nodes: buildEnduranceDraftNodes("RUN", 10, 20),
            durationMinutes: 30,
            profile: null,
          },
        },
        disciplineFilter: "ALL",
      }),
      false
    );
  });
});
