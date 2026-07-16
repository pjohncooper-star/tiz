import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PhaseKind } from "@prisma/client";
import {
  applyLongSessionTier,
  defaultLongWeekFlagAtWeek,
  defaultLongWeekFlags,
  initialLongWeekFlags,
  LONG_SESSION_MEDIUM_FACTOR,
  mergeLongWeekFlags,
  resolveLongWeekFlagsForSeason,
} from "./long-session-schedule";
import type { ComputedMesocycle } from "./types";

const mesocycles: ComputedMesocycle[] = [
  {
    phaseIndex: 0,
    name: "Base I",
    index: 0,
    startWeekIndex: 0,
    endWeekIndex: 3,
  },
  {
    phaseIndex: 0,
    name: "Base II",
    index: 1,
    startWeekIndex: 4,
    endWeekIndex: 7,
  },
];

describe("long-session-schedule", () => {
  it("applies medium tier at 60%", () => {
    assert.equal(applyLongSessionTier(120, true), 120);
    assert.equal(applyLongSessionTier(120, false), 72);
    assert.equal(LONG_SESSION_MEDIUM_FACTOR, 0.6);
  });

  it("defaults base to every other week full within mesocycle", () => {
    const kinds = Array(8).fill("BASE") as PhaseKind[];
    const flags = defaultLongWeekFlags({
      totalWeeks: 8,
      phaseKindsByWeek: kinds,
      mesocycles,
      deLoadFlags: Array(8).fill(false),
    });
    assert.deepEqual(flags, [true, false, true, false, true, false, true, false]);
  });

  it("defaults build to every week full", () => {
    const kinds = Array(8).fill("BUILD") as PhaseKind[];
    const flags = defaultLongWeekFlags({
      totalWeeks: 8,
      phaseKindsByWeek: kinds,
      mesocycles,
      deLoadFlags: Array(8).fill(false),
    });
    assert.ok(flags.every(Boolean));
  });

  it("forces de-load and taper weeks to medium", () => {
    const kinds = ["BUILD", "BUILD", "TAPER", "TAPER"] as PhaseKind[];
    assert.equal(
      defaultLongWeekFlagAtWeek(1, {
        totalWeeks: 4,
        phaseKindsByWeek: kinds,
        mesocycles: [
          {
            phaseIndex: 0,
            name: "Build I",
            index: 0,
            startWeekIndex: 0,
            endWeekIndex: 3,
          },
        ],
        deLoadFlags: [false, true, false, false],
      }),
      false
    );
    assert.equal(
      defaultLongWeekFlagAtWeek(2, {
        totalWeeks: 4,
        phaseKindsByWeek: kinds,
        mesocycles: [
          {
            phaseIndex: 0,
            name: "Build I",
            index: 0,
            startWeekIndex: 0,
            endWeekIndex: 3,
          },
        ],
        deLoadFlags: [false, false, false, false],
      }),
      false
    );
  });

  it("supports every-week preset", () => {
    const kinds = Array(4).fill("BASE") as PhaseKind[];
    const flags = defaultLongWeekFlags({
      totalWeeks: 4,
      phaseKindsByWeek: kinds,
      mesocycles: mesocycles.slice(0, 1),
      deLoadFlags: [false, false, false, false],
      preset: "every_week",
    });
    assert.deepEqual(flags, [true, true, true, true]);
  });

  it("mergeLongWeekFlags prefers stored flags when length matches", () => {
    const defaults = [true, false, true];
    assert.deepEqual(mergeLongWeekFlags(defaults, [false, true, false]), [
      false,
      true,
      false,
    ]);
    assert.deepEqual(mergeLongWeekFlags(defaults, [false]), defaults);
  });

  it("initialLongWeekFlags defaults all weeks to on", () => {
    assert.deepEqual(initialLongWeekFlags(4), [true, true, true, true]);
    assert.deepEqual(initialLongWeekFlags(0), []);
  });

  it("resolveLongWeekFlagsForSeason uses all-on when stored is null", () => {
    assert.deepEqual(
      resolveLongWeekFlagsForSeason({ totalWeeks: 3, stored: null }),
      [true, true, true]
    );
  });

  it("resolveLongWeekFlagsForSeason pads new weeks with on", () => {
    assert.deepEqual(
      resolveLongWeekFlagsForSeason({ totalWeeks: 4, stored: [false, true] }),
      [false, true, true, true]
    );
  });

  it("resolveLongWeekFlagsForSeason keeps stored when length matches", () => {
    assert.deepEqual(
      resolveLongWeekFlagsForSeason({
        totalWeeks: 2,
        stored: [false, true],
      }),
      [false, true]
    );
  });
});
