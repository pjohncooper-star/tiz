import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";
import {
  CHAINED_FROM_PRIOR_SUFFIX,
  formatChainedVolumeStartDisplay,
  resolveChainedPhaseVolumeStart,
  resolveStoredStartAfterEdit,
  stripChainedVolumeStartSuffix,
} from "./phase-volume-display";
import { defaultSimpleRampDefaults } from "./simple-ramp";

function assignedPhase(overrides: Partial<SimplePhase> & Pick<SimplePhase, "name">): SimplePhase {
  return {
    name: overrides.name,
    color: "#38bdf8",
    phaseKind: "BASE",
    startWeekIndex: overrides.startWeekIndex ?? 0,
    endWeekIndex: overrides.endWeekIndex ?? 3,
    rampEnabled: { swim: true, bike: true, run: true },
    swimSessionsPerWeek: 3,
    bikeSessionsPerWeek: 4,
    runSessionsPerWeek: 3,
    strengthSessionsPerWeek: 2,
    swimIntenseDaysPerWeek: 1,
    bikeIntenseDaysPerWeek: 1,
    runIntenseDaysPerWeek: 1,
    goal: null,
    zoneSplits: null,
    ...overrides,
  };
}

describe("phase-volume-display", () => {
  it("resolves chained discipline hours from prior phase exit", () => {
    const phases = [
      assignedPhase({
        id: "base",
        name: "Base",
        startWeekIndex: 0,
        endWeekIndex: 3,
        bikeStartHours: 6,
        bikeEndHours: 8,
      }),
      assignedPhase({
        id: "build",
        name: "Build",
        startWeekIndex: 4,
        endWeekIndex: 7,
        phaseKind: "BUILD",
      }),
    ];

    const chained = resolveChainedPhaseVolumeStart({
      phase: phases[1]!,
      phases,
      weeks: [],
      rampDefaults: defaultSimpleRampDefaults(),
      effectiveMode: "BY_DISCIPLINE",
      discipline: "bike",
    });

    assert.ok(chained);
    assert.equal(chained.kind, "hours");
    assert.equal(chained.fromPriorPhase, true);
    assert.equal(chained.value, 8);
  });

  it("formats chained start with suffix when prior phase exists", () => {
    const display = formatChainedVolumeStartDisplay(
      null,
      { value: 10000, fromPriorPhase: true, kind: "meters" },
      (value) => String(value)
    );
    assert.equal(display, `10000${CHAINED_FROM_PRIOR_SUFFIX}`);
  });

  it("keeps stored start null when edited value matches chained target", () => {
    const chained = { value: 8, fromPriorPhase: true, kind: "hours" as const };
    assert.equal(resolveStoredStartAfterEdit(8, chained), null);
    assert.equal(resolveStoredStartAfterEdit(9, chained), 9);
  });

  it("strips chained suffix before parsing user input", () => {
    assert.equal(
      stripChainedVolumeStartSuffix(`10000${CHAINED_FROM_PRIOR_SUFFIX}`),
      "10000"
    );
  });
});
