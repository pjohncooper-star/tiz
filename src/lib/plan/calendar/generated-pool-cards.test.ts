import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  applyTargetSessionId,
  generatedPoolCardId,
  resolveSelectedPoolCard,
  stagingPoolCardId,
} from "./generated-pool-cards";

function generatedSession(
  overrides: Partial<CalendarPlannedSession> = {}
): CalendarPlannedSession {
  return {
    id: "session-1",
    scheduledDate: "2026-07-07",
    discipline: "RUN",
    title: "Easy run",
    totalMinutes: 45,
    plannedMinutes: 45,
    distanceMeters: null,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: null,
    zoneAllocationMissing: false,
    source: "TEMPLATE",
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
    sessionRole: "MODERATE",
    displaySessionRole: "MODERATE",
    poolSlotKind: "ENDURANCE",
    ...overrides,
  };
}

describe("generated-pool-cards", () => {
  it("resolveSelectedPoolCard returns a virtual card for generated session ids", () => {
    const session = generatedSession();
    const cardId = generatedPoolCardId(session.id);
    const card = resolveSelectedPoolCard(cardId, [], {}, [session]);

    assert.ok(card);
    assert.equal(card!.id, cardId);
    assert.equal(card!.discipline, "RUN");
    assert.equal(card!.label, "Easy run");
  });

  it("resolveSelectedPoolCard returns staging card for copied workouts", () => {
    const card = resolveSelectedPoolCard(stagingPoolCardId("RUN"), [], {}, []);
    assert.ok(card);
    assert.equal(card!.label, "Copied workout");
    assert.equal(card!.discipline, "RUN");
  });

  it("applyTargetSessionId is set only for generated session targets", () => {
    const session = generatedSession();
    assert.equal(applyTargetSessionId(generatedPoolCardId(session.id)), session.id);
    assert.equal(applyTargetSessionId(stagingPoolCardId("RUN")), null);
    assert.equal(applyTargetSessionId("run-end-0"), null);
  });

  it("resolveSelectedPoolCard prefers chip cards over generated ids", () => {
    const chip = {
      id: "run-end-0",
      discipline: "RUN" as const,
      slotKind: "ENDURANCE" as const,
      label: "Run Endurance",
    };
    const card = resolveSelectedPoolCard("run-end-0", [chip], {}, []);
    assert.equal(card?.label, "Run Endurance");
  });
});
