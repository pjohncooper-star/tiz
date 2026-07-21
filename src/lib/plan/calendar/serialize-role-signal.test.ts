import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  serializePlannedSessions,
  signalPrefsFromDisciplineSettings,
} from "@/lib/plan/calendar/serialize";
import { buildEnduranceDraftNodes } from "@/lib/plan/calendar/spread-easy-tiz";
import { preferenceSnapshot } from "@/lib/zones/signal-preference";
import { serializeWorkoutTree, WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";
import type { PlannedSession } from "@prisma/client";

function sessionRow(
  overrides: Partial<PlannedSession> & {
    structuredWorkout?: { steps: unknown } | null;
    sessionRole?: PlannedSession["sessionRole"];
  } = {}
) {
  const nodes = buildEnduranceDraftNodes("RUN", 20, 25);
  return {
    id: "ps1",
    athleteId: "a1",
    weeklyTemplateItemId: null,
    goalEventId: null,
    scheduledDate: new Date("2026-07-21T00:00:00.000Z"),
    discipline: "RUN" as const,
    title: "Easy run",
    notes: null,
    targetZones: null,
    distanceMeters: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
    poolSize: null,
    source: "FLEXIBLE" as const,
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

describe("serializePlannedSessions role-aware profile", () => {
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

  it("easy session with HR override uses HR-scale profile (zone 1–5)", () => {
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
    // HR profile Y-axis is zone numbers ~1–5
    assert.ok(easy.workoutProfile!.yMax <= 5.5);
    assert.ok(easy.workoutProfile!.yMin >= 0.5);
  });

  it("intensity session keeps pace-scale profile when override is only for easy", () => {
    const prefs = {
      RUN: preferenceSnapshot("RUN", "PACE", { EASY: "HEART_RATE" }),
    };
    const [intensity] = serializePlannedSessions(
      [sessionRow({ sessionRole: "INTENSITY", title: "Intervals" })],
      { RUN: "METRIC" },
      {},
      prefs
    );
    assert.ok(intensity.workoutProfile, "expected workout profile");
    // Pace inverted Y is negative seconds-based scale, not HR zones 1–5
    assert.ok(intensity.workoutProfile!.yMax < 0);
  });

  it("session override beats role override on profile axis", () => {
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
});
