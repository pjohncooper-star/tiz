import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  programOriginCaption,
  programOriginForSession,
  serializePlannedSessions,
  sessionSourceLabel,
  signalPrefsFromDisciplineSettings,
} from "@/lib/plan/calendar/serialize";
import { buildEnduranceDraftNodes } from "@/lib/plan/calendar/spread-easy-tiz";
import { preferenceSnapshot } from "@/lib/zones/signal-preference";
import {
  serializeWorkoutTree,
  WORKOUT_TREE_VERSION,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";
import type { PlannedSession } from "@prisma/client";

function sessionRow(
  overrides: Partial<PlannedSession> & {
    structuredWorkout?: { steps: unknown } | null;
    sessionRole?: PlannedSession["sessionRole"];
    trainingPlan?: { name: string } | null;
  } = {}
) {
  const nodes = buildEnduranceDraftNodes("RUN", 20, 25);
  return {
    id: "ps1",
    athleteId: "a1",
    weeklyTemplateItemId: null,
    goalEventId: null,
    scheduledDate: new Date("2026-07-21T00:00:00.000Z"),
    scheduledTimeMinutes: null,
    daySortOrder: 0,
    discipline: "RUN" as const,
    title: "Easy run",
    notes: null,
    tags: [],
    targetZones: null,
    distanceMeters: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
    poolSize: null,
    source: "FLEXIBLE" as const,
    trainingPlanId: null,
    trainingPlanSessionId: null,
    seasonTrainingPlanAttachmentId: null,
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: 45,
    zoneAllocationMissing: false,
    linkedActivityId: null,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    sessionRole: "EASY" as const,
    tizSignalOverride: null,
    poolSlotKind: null,
    structuredWorkout: {
      steps: serializeWorkoutTree({ version: WORKOUT_TREE_VERSION, nodes }),
    },
    ...overrides,
  };
}

function bikePowerIntervalNodes(): WorkoutNode[] {
  return [
    {
      kind: "repeat",
      repeatCount: 4,
      children: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "time", value: 300 },
          target: { signal: "power", mode: "value", value: 250 },
        },
        {
          kind: "step",
          intensity: "recovery",
          duration: { type: "time", value: 180 },
          target: { signal: "power", mode: "value", value: 150 },
        },
      ],
    },
    {
      kind: "step",
      intensity: "active",
      duration: { type: "time", value: 720 },
      target: { signal: "power", mode: "value", value: 150 },
    },
  ];
}

describe("serializePlannedSessions prescription-driven profile", () => {
  it("signalPrefsFromDisciplineSettings parses roleSignals", () => {
    const prefs = signalPrefsFromDisciplineSettings([
      {
        discipline: "RUN",
        primarySignal: "PACE",
        fallbackSignal: "HEART_RATE",
        roleSignals: { EASY: "HEART_RATE" },
      },
    ]);
    assert.equal(prefs.RUN?.primarySignal, "PACE");
    assert.equal(prefs.RUN?.roleSignals.EASY, "HEART_RATE");
  });

  it("structured run profiles follow pace prescription, not TiZ HR role override", () => {
    const prefs = {
      RUN: preferenceSnapshot("RUN", "PACE", { EASY: "HEART_RATE" }),
    };
    const [easy] = serializePlannedSessions(
      [sessionRow({ sessionRole: "EASY" })],
      { RUN: "METRIC" },
      {},
      prefs
    );
    assert.ok(easy.workoutProfile, "expected workout profile");
    // Pace inverted Y is negative seconds-based scale, not HR zones 1–5
    assert.ok(easy.workoutProfile!.yMax < 0);
  });

  it("session TiZ override is still serialized even though profile follows prescription", () => {
    const prefs = {
      RUN: preferenceSnapshot("RUN", "PACE", { EASY: "HEART_RATE" }),
    };
    const [session] = serializePlannedSessions(
      [sessionRow({ sessionRole: "EASY", tizSignalOverride: "PACE" })],
      { RUN: "METRIC" },
      {},
      prefs
    );
    assert.ok(session.workoutProfile);
    assert.ok(session.workoutProfile!.yMax < 0);
    assert.equal(session.tizSignalOverride, "PACE");
  });

  it("bike power intervals stay structured when athlete TiZ primary is HEART_RATE", () => {
    const nodes = bikePowerIntervalNodes();
    const prefs = {
      BIKE: preferenceSnapshot("BIKE", "HEART_RATE"),
    };
    const [bike] = serializePlannedSessions(
      [
        sessionRow({
          id: "bike1",
          discipline: "BIKE",
          title: "Bike intervals",
          sessionRole: "INTENSITY",
          structuredWorkout: {
            steps: serializeWorkoutTree({ version: WORKOUT_TREE_VERSION, nodes }),
          },
        }),
      ],
      { BIKE: "METRIC" },
      {},
      prefs
    );
    assert.ok(bike.workoutProfile);
    const heights = new Set(bike.workoutProfile!.segments.map((s) => s.yHigh));
    assert.ok(
      heights.size >= 2,
      `expected distinct power heights, got ${[...heights].join(",")}`
    );
    assert.ok(
      bike.workoutProfile!.segments.some((s) => s.yHigh === 250),
      "expected 250W interval peaks"
    );
    assert.ok(
      bike.workoutProfile!.segments.some((s) => s.yHigh === 150),
      "expected 150W recovery/steady"
    );
  });
});

describe("program origin", () => {
  it("labels library vs season applies", () => {
    assert.equal(
      programOriginForSession({
        trainingPlanId: "p1",
        seasonTrainingPlanAttachmentId: null,
      }),
      "library"
    );
    assert.equal(
      programOriginForSession({
        trainingPlanId: "p1",
        seasonTrainingPlanAttachmentId: "att-1",
      }),
      "season"
    );
    assert.equal(
      programOriginForSession({
        trainingPlanId: null,
        seasonTrainingPlanAttachmentId: null,
      }),
      null
    );
    assert.equal(
      programOriginCaption({ trainingPlanName: "Base Build", programOrigin: "library" }),
      "Base Build"
    );
    assert.equal(
      programOriginCaption({ trainingPlanName: "Base Build", programOrigin: "season" }),
      "Base Build · season"
    );
    assert.equal(
      sessionSourceLabel({
        source: "PLAN",
        trainingPlanName: "Base Build",
        programOrigin: "library",
      }),
      "Program · Base Build"
    );
    assert.equal(
      sessionSourceLabel({
        source: "PLAN",
        trainingPlanName: "Base Build",
        programOrigin: "season",
      }),
      "Program · Base Build · season"
    );
    assert.equal(sessionSourceLabel({ source: "FLEXIBLE" }), "Calendar");
    assert.equal(sessionSourceLabel({ source: "TEMPLATE" }), "Weekly template");
  });

  it("serializePlannedSessions stamps origin from the plan join", () => {
    const [library] = serializePlannedSessions(
      [
        sessionRow({
          source: "PLAN",
          trainingPlanId: "tp1",
          seasonTrainingPlanAttachmentId: null,
          trainingPlan: { name: "Base Build" },
        }),
      ],
      { RUN: "METRIC" }
    );
    assert.equal(library.trainingPlanId, "tp1");
    assert.equal(library.trainingPlanName, "Base Build");
    assert.equal(library.programOrigin, "library");

    const [season] = serializePlannedSessions(
      [
        sessionRow({
          source: "PLAN",
          trainingPlanId: "tp1",
          seasonTrainingPlanAttachmentId: "att-1",
          trainingPlan: { name: "Base Build" },
        }),
      ],
      { RUN: "METRIC" }
    );
    assert.equal(season.programOrigin, "season");
  });
});
