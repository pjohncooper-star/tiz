import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
  DEFAULT_PHASE_VOLUME_FIELDS,
  type SimplePhase,
} from "@/components/simple-planner/simple-planner-types";
import {
  DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS,
  isFullLongWeekForSimplePhase,
  isLongSessionDisabledForPhase,
  phaseVolumeSettingsForSimplePhase,
  recalculateSimpleLongSessions,
} from "./simple-long-session";
import { defaultSimpleRampDefaults } from "./simple-ramp";

function phase(
  start: number,
  end: number,
  overrides: Partial<SimplePhase> = {}
): SimplePhase {
  return {
    id: "p1",
    name: "Base",
    color: "#38bdf8",
    startWeekIndex: start,
    endWeekIndex: end,
    rampEnabled: { swim: true, bike: true, run: true },
    ...DEFAULT_PHASE_SESSIONS,
    ...DEFAULT_PHASE_INTENSE_DAYS,
    goal: null,
    ...DEFAULT_PHASE_VOLUME_FIELDS,
    ...overrides,
  };
}

describe("simple-long-session", () => {
  it("disables long sessions for taper and none cadence", () => {
    assert.equal(
      isLongSessionDisabledForPhase(
        phaseVolumeSettingsForSimplePhase(
          phase(0, 3, { volumeTrend: "TAPER", longSessionCadence: "NONE" })
        )
      ),
      true
    );
    assert.equal(
      isLongSessionDisabledForPhase(
        phaseVolumeSettingsForSimplePhase(
          phase(0, 3, { volumeTrend: "HOLD", longSessionCadence: "NONE" })
        )
      ),
      true
    );
  });

  it("alternates full weeks for every-other cadence", () => {
    const everyOther = phase(0, 3, { longSessionCadence: "EVERY_OTHER" });
    assert.equal(
      isFullLongWeekForSimplePhase({ weekIndex: 0, phase: everyOther, isRestWeek: false }),
      true
    );
    assert.equal(
      isFullLongWeekForSimplePhase({ weekIndex: 1, phase: everyOther, isRestWeek: false }),
      false
    );
    assert.equal(
      isFullLongWeekForSimplePhase({ weekIndex: 1, phase: everyOther, isRestWeek: true }),
      false
    );
  });

  it("ramps long ride minutes across weeks", () => {
    const phases = [phase(0, 7, { volumeTrend: "INCREASE", longSessionCadence: "EVERY_WEEK" })];
    const weeks = Array.from({ length: 8 }, (_, weekIndex) => ({
      weekIndex,
      isRestWeek: false,
    }));
    const result = recalculateSimpleLongSessions({
      weeks,
      phases,
      longDefaults: DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS,
      rampDefaults: defaultSimpleRampDefaults(),
    });
    assert.ok(result[7]!.longRideMinutes >= result[0]!.longRideMinutes);
    assert.ok(result.every((week) => week.longRideMinutes > 0));
  });

  it("returns zero minutes for taper phases", () => {
    const phases = [
      phase(0, 3, { name: "Taper", volumeTrend: "TAPER", longSessionCadence: "NONE" }),
    ];
    const weeks = Array.from({ length: 4 }, (_, weekIndex) => ({
      weekIndex,
      isRestWeek: false,
    }));
    const result = recalculateSimpleLongSessions({
      weeks,
      phases,
      longDefaults: DEFAULT_SIMPLE_LONG_SESSION_DEFAULTS,
      rampDefaults: defaultSimpleRampDefaults(),
    });
    assert.deepEqual(result, weeks.map(() => ({ longRideMinutes: 0, longRunMinutes: 0 })));
  });
});
