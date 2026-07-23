import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";
import { generatedPoolCardId } from "@/lib/plan/calendar/generated-pool-cards";
import { buildEnduranceDraftNodes } from "@/lib/plan/calendar/spread-easy-tiz";
import { zoneKey } from "@/lib/workout/steps";
import { computeEffectiveScheduledTiz } from "./effective-scheduled-tiz";

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
    },
    byDiscipline: [
      { discipline: "RUN", hours: 3, zoneMinutes: {}, sessionsPerWeek: 3, intenseDaysPerWeek: 1 },
      { discipline: "BIKE", hours: 4, zoneMinutes: {}, sessionsPerWeek: 4, intenseDaysPerWeek: 2 },
    ],
    slotBudgets: {
      SWIM: {
        endurance: 0,
        intensity: 0,
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
  slotKind: UnscheduledChip["slotKind"]
): UnscheduledChip {
  return { id, discipline, slotKind, label: `${discipline} ${slotKind}` };
}

function session(
  id: string,
  discipline: CalendarPlannedSession["discipline"],
  zoneMinutes: Record<string, number>,
  overrides: Partial<CalendarPlannedSession> = {}
): CalendarPlannedSession {
  return {
    id,
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
    tizSignalOverride: null,
    poolSlotKind: "ENDURANCE",
    ...overrides,
  };
}

describe("effective-scheduled-tiz", () => {
  it("rolls up persisted session zone minutes", () => {
    const weekTarget = baseWeekTarget();
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [session("s1", "RUN", { [zoneKey("RUN", 1)]: 10, [zoneKey("RUN", 2)]: 20 })],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)], 10);
    assert.equal(rollup.main[zoneKey("RUN", 2)], 20);
  });

  it("excludes placeholder zones on fillable generated sessions", () => {
    const weekTarget = baseWeekTarget();
    const generated = session(
      "gen-1",
      "RUN",
      { [zoneKey("RUN", 1)]: 99, [zoneKey("RUN", 2)]: 99 },
      { source: "TEMPLATE", stepCount: 0 }
    );
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [generated],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)] ?? 0, 0);
    assert.equal(rollup.main[zoneKey("RUN", 2)] ?? 0, 0);
  });

  it("includes pool draft zone minutes for chips", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("run-end-0", "RUN", "ENDURANCE")];
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [],
      drafts: {
        "run-end-0": {
          nodes: buildEnduranceDraftNodes("RUN", 10, 25),
          durationMinutes: 35,
          profile: null,
        },
      },
      chips,
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)], 10);
    assert.equal(rollup.main[zoneKey("RUN", 2)], 25);
  });

  it("includes draft zone minutes for fillable generated sessions", () => {
    const weekTarget = baseWeekTarget();
    const generated = session(
      "gen-1",
      "RUN",
      { [zoneKey("RUN", 1)]: 99 },
      { source: "TEMPLATE", stepCount: 0 }
    );
    const cardId = generatedPoolCardId("gen-1");
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [generated],
      drafts: {
        [cardId]: {
          nodes: buildEnduranceDraftNodes("RUN", 5, 15),
          durationMinutes: 20,
          profile: null,
        },
      },
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)], 5);
    assert.equal(rollup.main[zoneKey("RUN", 2)], 15);
  });

  it("live overlay replaces saved draft for the armed card", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("run-end-0", "RUN", "ENDURANCE")];
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [],
      drafts: {
        "run-end-0": {
          nodes: buildEnduranceDraftNodes("RUN", 10, 10),
          durationMinutes: 20,
          profile: null,
        },
      },
      chips,
      liveOverlay: {
        cardId: "run-end-0",
        nodes: buildEnduranceDraftNodes("RUN", 3, 7),
        discipline: "RUN",
      },
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)], 3);
    assert.equal(rollup.main[zoneKey("RUN", 2)], 7);
  });

  it("routes long session and long draft zones to the long bucket", () => {
    const weekTarget = baseWeekTarget({ planningMode: "SEPARATE_LONG_TIZ" });
    const chips = [chip("run-long-0", "RUN", "LONG")];
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [
        session(
          "long-session",
          "RUN",
          { [zoneKey("RUN", 1)]: 15, [zoneKey("RUN", 2)]: 75 },
          { sessionRole: "LONG", poolSlotKind: "LONG" }
        ),
      ],
      drafts: {
        "run-long-0": {
          nodes: buildEnduranceDraftNodes("RUN", 10, 50),
          durationMinutes: 60,
          profile: null,
        },
      },
      chips,
    });
    assert.equal(rollup.main[zoneKey("RUN", 1)] ?? 0, 0);
    assert.equal(rollup.long[zoneKey("RUN", 1)], 25);
    assert.equal(rollup.long[zoneKey("RUN", 2)], 125);
  });

  it("ignores staging pool card drafts", () => {
    const weekTarget = baseWeekTarget();
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [],
      drafts: {
        "staging:RUN": {
          nodes: buildEnduranceDraftNodes("RUN", 40, 40),
          durationMinutes: 80,
          profile: null,
        },
      },
      chips: [],
    });
    assert.equal(Object.keys(rollup.main).length, 0);
  });

  it("maps absolute watt bike draft steps into Z1–Z5 via FTP", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("bike-int-0", "BIKE", "INTENSITY")];
    const wattNodes = [
      {
        kind: "repeat" as const,
        repeatCount: 4,
        children: [
          {
            kind: "step" as const,
            intensity: "interval" as const,
            duration: { type: "time" as const, value: 300 },
            target: { signal: "power" as const, mode: "value" as const, value: 250 },
          },
          {
            kind: "step" as const,
            intensity: "recovery" as const,
            duration: { type: "time" as const, value: 180 },
            target: { signal: "power" as const, mode: "value" as const, value: 150 },
          },
        ],
      },
    ];
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [],
      drafts: {
        "bike-int-0": {
          nodes: wattNodes,
          durationMinutes: 32,
          profile: null,
        },
      },
      chips,
      paceContext: {
        BIKE: {
          thresholdPaceSeconds: null,
          zoneBoundaries: [55, 75, 90, 105],
          thresholdFtpWatts: 250,
          powerZoneBoundaries: [55, 75, 90, 105],
        },
      },
    });
    // 4×5m @ 250W (100% FTP) → Z4; 4×3m @ 150W (60%) → Z2
    assert.equal(rollup.main[zoneKey("BIKE", 4)], 20);
    assert.equal(rollup.main[zoneKey("BIKE", 2)], 12);
  });

  it("folds zone-6 draft steps into BIKE-5 for Week TiZ", () => {
    const weekTarget = baseWeekTarget();
    const chips = [chip("bike-int-0", "BIKE", "INTENSITY")];
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [],
      drafts: {
        "bike-int-0": {
          nodes: [
            {
              kind: "step",
              intensity: "interval",
              duration: { type: "time", value: 300 },
              target: { signal: "power", mode: "zone", zone: 6 },
            },
          ],
          durationMinutes: 5,
          profile: null,
        },
      },
      chips,
    });
    assert.equal(rollup.main[zoneKey("BIKE", 5)], 5);
    assert.equal(rollup.main[zoneKey("BIKE", 6)] ?? 0, 0);
  });

  it("folds persisted BIKE-6 session minutes into BIKE-5 for Week TiZ", () => {
    const weekTarget = baseWeekTarget();
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [
        session(
          "intensity-ride",
          "BIKE",
          { "BIKE-6": 5, "BIKE-2": 20 },
          {
            sessionRole: "INTENSITY",
            poolSlotKind: "INTENSITY",
            stepCount: 8,
            source: "TEMPLATE",
            plannedMinutes: 40,
          }
        ),
      ],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("BIKE", 5)], 5);
    assert.equal(rollup.main[zoneKey("BIKE", 2)], 20);
    assert.equal(rollup.main["BIKE-6"] ?? 0, 0);
  });

  it("counts TEMPLATE long bike zone minutes in main (SEPARATE_LONGS, no draft)", () => {
    const weekTarget = baseWeekTarget({ planningMode: "SEPARATE_LONGS" });
    const longBike = session(
      "long-bike-1",
      "BIKE",
      { [zoneKey("BIKE", 1)]: 9, [zoneKey("BIKE", 2)]: 81 },
      {
        source: "TEMPLATE",
        stepCount: 0,
        sessionRole: "LONG",
        poolSlotKind: "LONG",
        plannedMinutes: 90,
      }
    );
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [longBike],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("BIKE", 1)], 9);
    assert.equal(rollup.main[zoneKey("BIKE", 2)], 81);
    assert.equal(Object.keys(rollup.long).length, 0);
  });

  it("counts TEMPLATE long bike zone minutes in long bucket (SEPARATE_LONG_TIZ, no draft)", () => {
    const weekTarget = baseWeekTarget({
      planningMode: "SEPARATE_LONG_TIZ",
      longSessionZoneMinutes: {
        [zoneKey("BIKE", 1)]: 9,
        [zoneKey("BIKE", 2)]: 81,
      },
    });
    const longBike = session(
      "long-bike-2",
      "BIKE",
      { [zoneKey("BIKE", 2)]: 90 },
      {
        source: "TEMPLATE",
        stepCount: 0,
        sessionRole: "LONG",
        poolSlotKind: "LONG",
        plannedMinutes: 90,
      }
    );
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [longBike],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.long[zoneKey("BIKE", 2)], 90);
    assert.equal(rollup.main[zoneKey("BIKE", 2)] ?? 0, 0);
  });

  it("still excludes non-long fillable generated sessions without a draft", () => {
    const weekTarget = baseWeekTarget({ planningMode: "SEPARATE_LONGS" });
    const easy = session(
      "easy-bike",
      "BIKE",
      { [zoneKey("BIKE", 2)]: 60 },
      {
        source: "TEMPLATE",
        stepCount: 0,
        sessionRole: "EASY",
        poolSlotKind: "ENDURANCE",
      }
    );
    const rollup = computeEffectiveScheduledTiz({
      weekTarget,
      sessions: [easy],
      drafts: {},
      chips: [],
    });
    assert.equal(rollup.main[zoneKey("BIKE", 2)] ?? 0, 0);
  });
});
