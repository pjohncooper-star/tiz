import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  linearVolumeAtWeek,
  planUsesPhaseVolumeRamps,
  recalculatePhaseAwareVolumes,
  type PhaseVolumeSpan,
} from "./simple-phase-volume";
import { defaultSimpleRampDefaults } from "./simple-ramp";
import type { SimpleWeekVolume } from "./simple-ramp";

function basePhase(overrides: Partial<PhaseVolumeSpan> = {}): PhaseVolumeSpan {
  return {
    startWeekIndex: 0,
    endWeekIndex: 3,
    planningMode: "BY_DISCIPLINE",
    phaseKind: "BASE",
    rampEnabled: { swim: true, bike: true, run: true },
    ...overrides,
  };
}

function week(
  weekIndex: number,
  swim: number,
  bike: number,
  run: number,
  isRestWeek = false
): SimpleWeekVolume {
  return {
    weekIndex,
    isRestWeek,
    swimHours: swim,
    bikeHours: bike,
    runHours: run,
    totalHours: swim + bike + run,
  };
}

describe("simple-phase-volume", () => {
  it("detects when phases have volume config", () => {
    assert.equal(planUsesPhaseVolumeRamps([basePhase()]), false);
    assert.equal(
      planUsesPhaseVolumeRamps([basePhase({ bikeStartHours: 4, bikeEndHours: 6 })]),
      true
    );
  });

  it("linearVolumeAtWeek lerps entry to exit across non-rest weeks", () => {
    const phase = basePhase();
    const weeks = [week(0, 0, 4, 0), week(1, 0, 4, 0), week(2, 0, 4, 0, true), week(3, 0, 4, 0)];
    assert.equal(linearVolumeAtWeek(6, 8, weeks, phase, 0, true), 6);
    assert.equal(linearVolumeAtWeek(6, 8, weeks, phase, 1, true), 7);
    assert.equal(linearVolumeAtWeek(6, 8, weeks, phase, 3, true), 8);
  });

  it("ramps per discipline with linear lerp when phase fields set", () => {
    const phases = [
      basePhase({
        bikeStartHours: 6,
        bikeEndHours: 8,
        runStartHours: 3,
        runEndHours: 4,
      }),
    ];
    const defaults = defaultSimpleRampDefaults();
    const weeks = [
      week(0, 2, 6, 3),
      week(1, 2, 6, 3),
      week(2, 2, 6, 3),
      week(3, 2, 6, 3),
    ];

    const result = recalculatePhaseAwareVolumes({
      weeks,
      phases,
      rampPhaseSpans: phases.map((p) => ({
        startWeekIndex: p.startWeekIndex,
        endWeekIndex: p.endWeekIndex,
        rampEnabled: p.rampEnabled,
      })),
      defaults,
      restVolumePercent: 75,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      seasonAnchors: { startHours: 8, peakHours: 12 },
      seasonSplit: { swim: 25, bike: 50, run: 25 },
    });

    assert.equal(result[0]!.bikeHours, 6);
    assert.equal(result[3]!.bikeHours, 8);
    assert.equal(result[0]!.runHours, 3);
    assert.equal(result[3]!.runHours, 4);
  });

  it("chains total hours across phases in OVERALL mode", () => {
    const phases = [
      basePhase({
        startWeekIndex: 0,
        endWeekIndex: 1,
        planningMode: "OVERALL",
        volumeStartHours: 10,
        volumeEndHours: 12,
      }),
      basePhase({
        startWeekIndex: 2,
        endWeekIndex: 3,
        planningMode: "OVERALL",
        volumeEndHours: 14,
      }),
    ];
    const defaults = defaultSimpleRampDefaults();
    const weeks = [week(0, 2, 4, 2), week(1, 2, 4, 2), week(2, 2, 4, 2), week(3, 2, 4, 2)];

    const result = recalculatePhaseAwareVolumes({
      weeks,
      phases,
      rampPhaseSpans: phases.map((p) => ({
        startWeekIndex: p.startWeekIndex,
        endWeekIndex: p.endWeekIndex,
        rampEnabled: p.rampEnabled,
      })),
      defaults,
      restVolumePercent: 75,
      seasonDefaultPlanningMode: "OVERALL",
      seasonAnchors: { startHours: 8, peakHours: 16 },
      seasonSplit: { swim: 25, bike: 50, run: 25 },
    });

    assert.equal(result[0]!.totalHours, 10);
    assert.equal(result[1]!.totalHours, 12);
    assert.equal(result[2]!.totalHours, 12);
    assert.equal(result[3]!.totalHours, 14);
  });

  it("falls back to season compound ramp when no phase volume config", () => {
    const phases = [basePhase()];
    const defaults = defaultSimpleRampDefaults();
    defaults.bike.ratePercent = 10;
    const weeks = [week(0, 2, 4, 2), week(1, 2, 4, 2)];

    const result = recalculatePhaseAwareVolumes({
      weeks,
      phases,
      rampPhaseSpans: [
        {
          startWeekIndex: 0,
          endWeekIndex: 1,
          rampEnabled: { swim: true, bike: true, run: true },
        },
      ],
      defaults,
      restVolumePercent: 75,
      seasonDefaultPlanningMode: "BY_DISCIPLINE",
      seasonAnchors: { startHours: 8, peakHours: 16 },
      seasonSplit: { swim: 25, bike: 50, run: 25 },
    });

    assert.equal(result[1]!.bikeHours, 4.4);
  });
});
