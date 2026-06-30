import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { groupPlannedSessions } from "./group-planned-sessions";

function raceSession(
  partial: Partial<CalendarPlannedSession> & Pick<CalendarPlannedSession, "id">
): CalendarPlannedSession {
  return {
    scheduledDate: "2026-09-01",
    discipline: "RUN",
    title: "Race",
    source: "RACE",
    distanceMeters: null,
    estimatedDurationMinutes: null,
    multisportGroupId: null,
    sessionIndex: null,
    notes: null,
    linkedActivityId: null,
    targetSpeedMps: null,
    targetPaceSeconds: null,
    poolSize: null,
    targetZones: null,
    durationMinutes: null,
    ...partial,
  } as CalendarPlannedSession;
}

describe("groupPlannedSessions", () => {
  it("groups multisport race legs into one entry", () => {
    const grouped = groupPlannedSessions([
      raceSession({
        id: "s1",
        discipline: "SWIM",
        multisportGroupId: "grp_1",
        sessionIndex: 0,
        title: "Tri",
      }),
      raceSession({
        id: "s2",
        discipline: "BIKE",
        multisportGroupId: "grp_1",
        sessionIndex: 1,
        title: "Tri",
      }),
      raceSession({
        id: "s3",
        discipline: "RUN",
        multisportGroupId: "grp_1",
        sessionIndex: 2,
        title: "Tri",
      }),
      raceSession({ id: "s4", discipline: "RUN", title: "5K" }),
    ]);

    const multisport = grouped.filter((g) => g.kind === "multisport_race");
    const singles = grouped.filter((g) => g.kind === "single");
    assert.equal(multisport.length, 1);
    assert.equal(singles.length, 1);
    if (multisport[0]?.kind === "multisport_race") {
      assert.equal(multisport[0].legs.length, 3);
      assert.equal(multisport[0].title, "Tri");
    }
  });
});
