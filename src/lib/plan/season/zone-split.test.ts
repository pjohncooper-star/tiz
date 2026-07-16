import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import { defaultZoneSplitsForKind } from "./phase-zone-defaults";
import {
  lerpZonePercents,
  recalculateZoneMinutesFromSplits,
  resolveZonePercentsForWeek,
  type ZonePhaseSpan,
} from "./zone-split";

function phaseSpan(
  start: number,
  end: number,
  kind: "BASE" | "BUILD" = "BASE",
  ramp = true
): ZonePhaseSpan {
  return {
    startWeekIndex: start,
    endWeekIndex: end,
    rampEnabled: { swim: ramp, bike: ramp, run: ramp },
    zoneSplits: defaultZoneSplitsForKind(kind),
  };
}

describe("zone-split", () => {
  it("lerps zone percents linearly", () => {
    const start = { z1: 80, z2: 15, z3: 4, z4: 0.5, z5: 0.5 };
    const end = { z1: 50, z2: 30, z3: 15, z4: 4, z5: 1 };
    const mid = lerpZonePercents(start, end, 0.5);
    assert.ok(Math.abs(mid.z3 - 9.5) < 0.2);
  });

  it("computes run Z3 minutes from volume and split %", () => {
    const phases = [phaseSpan(0, 3, "BUILD")];
    const zones = recalculateZoneMinutesFromSplits(
      [
        {
          weekIndex: 3,
          isRestWeek: false,
          swimHours: 2,
          bikeHours: 4,
          runHours: 4,
        },
      ],
      phases,
      "VOLUME_ONLY"
    );
    const z3 = zones[0]![zoneKey("RUN", 3)]!;
    assert.ok(Math.abs(z3 - 36) < 1);
  });

  it("chains exit percents into the next phase entry week", () => {
    const phases = [phaseSpan(0, 1, "BASE"), phaseSpan(2, 3, "BUILD")];
    const baseExit = resolveZonePercentsForWeek({
      weekIndex: 1,
      phases,
      discipline: "RUN",
    });
    const buildEntry = resolveZonePercentsForWeek({
      weekIndex: 2,
      phases,
      discipline: "RUN",
    });
    assert.equal(Math.round(baseExit.z3), Math.round(buildEntry.z3));
  });

  it("explicit start/end percents ramp within a phase", () => {
    const start = { z1: 10, z2: 70, z3: 10, z4: 10, z5: 0 };
    const end = { z1: 10, z2: 65, z3: 20, z4: 5, z5: 0 };
    const phases: ZonePhaseSpan[] = [
      {
        startWeekIndex: 0,
        endWeekIndex: 3,
        rampEnabled: { swim: true, bike: true, run: true },
        zoneSplits: {
          SWIM: { mode: "custom", percents: end, startPercents: start, endPercents: end },
          BIKE: { mode: "custom", percents: end, startPercents: start, endPercents: end },
          RUN: { mode: "custom", percents: end, startPercents: start, endPercents: end },
        },
      },
    ];
    const w0 = resolveZonePercentsForWeek({ weekIndex: 0, phases, discipline: "BIKE" });
    const w3 = resolveZonePercentsForWeek({ weekIndex: 3, phases, discipline: "BIKE" });
    assert.equal(Math.round(w0.z2), 70);
    assert.equal(Math.round(w3.z2), 65);
    assert.equal(Math.round(w3.z3), 20);
  });

  it("holds flat percents when ramp is disabled for discipline", () => {
    const phases: ZonePhaseSpan[] = [
      {
        startWeekIndex: 0,
        endWeekIndex: 3,
        rampEnabled: { swim: true, bike: true, run: false },
        zoneSplits: defaultZoneSplitsForKind("BUILD"),
      },
    ];
    const w0 = resolveZonePercentsForWeek({ weekIndex: 0, phases, discipline: "RUN" });
    const w3 = resolveZonePercentsForWeek({ weekIndex: 3, phases, discipline: "RUN" });
    assert.equal(Math.round(w0.z3), Math.round(w3.z3));
  });
});
