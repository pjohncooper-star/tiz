import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inheritTargetZonesFromRole } from "./inherit-target-zones";
import type { CalendarWeekTarget } from "@/components/calendar/types";

function weekTarget(): CalendarWeekTarget {
  return {
    weekStart: "2026-07-06",
    weekIndex: 0,
    isRestWeek: false,
    totalHours: 10,
    phase: null,
    strengthSessionsPerWeek: 0,
    byDiscipline: [
      {
        discipline: "RUN",
        hours: 4,
        zoneMinutes: {},
        sessionsPerWeek: 4,
        intenseDaysPerWeek: 1,
      },
    ],
    zoneMinutes: {
      "RUN-1": 60,
      "RUN-2": 120,
      "RUN-3": 30,
      "RUN-4": 10,
      "RUN-5": 5,
    },
  };
}

describe("inheritTargetZonesFromRole", () => {
  it("returns undefined for strength", () => {
    assert.equal(
      inheritTargetZonesFromRole({
        sessionRole: "MODERATE",
        discipline: "STRENGTH",
        weekTarget: weekTarget(),
        sessions: [],
        unscheduledCount: 1,
      }),
      undefined
    );
  });

  it("skews intensity toward Z3+", () => {
    const zones = inheritTargetZonesFromRole({
      sessionRole: "INTENSITY",
      discipline: "RUN",
      weekTarget: weekTarget(),
      sessions: [],
      unscheduledCount: 1,
    });
    assert.ok(zones);
    assert.ok((zones!["3"] ?? 0) > (zones!["2"] ?? 0));
  });

  it("uses moderate as all Z2", () => {
    const zones = inheritTargetZonesFromRole({
      sessionRole: "MODERATE",
      discipline: "RUN",
      weekTarget: weekTarget(),
      sessions: [],
      unscheduledCount: 4,
    });
    assert.ok(zones);
    assert.equal(zones!["2"], 56);
    assert.equal(zones!["1"], undefined);
  });

  it("inherits long-session TiZ from longSessionZoneMinutes", () => {
    const zones = inheritTargetZonesFromRole({
      sessionRole: "LONG",
      discipline: "BIKE",
      weekTarget: {
        ...weekTarget(),
        planningMode: "SEPARATE_LONG_TIZ",
        longSessionZoneMinutes: {
          "BIKE-1": 12,
          "BIKE-2": 108,
        },
      },
      sessions: [],
      unscheduledCount: 1,
      targetDurationMinutes: 120,
    });
    assert.ok(zones);
    assert.equal(zones!["1"], 12);
    assert.equal(zones!["2"], 108);
  });
});
