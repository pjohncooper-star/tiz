import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyPhase, createPhaseAtWeek } from "@/components/simple-planner/simple-planner-types";
import { defaultSimpleRampDefaults } from "./simple-ramp";
import { migrateSeasonRampDefaultsOntoPhases } from "./migrate-season-ramp-to-phases";

describe("migrateSeasonRampDefaultsOntoPhases", () => {
  it("seeds percent progression from season ramp defaults", () => {
    const phases = [
      createPhaseAtWeek(0, 1),
      { ...createPhaseAtWeek(4, 2), endWeekIndex: 7 },
    ];
    phases[0]!.endWeekIndex = 3;
    const defaults = defaultSimpleRampDefaults();
    defaults.run.ratePercent = 10;
    defaults.run.startHours = 2;
    defaults.run.peakHours = 5;

    const { phases: next, migrated } = migrateSeasonRampDefaultsOntoPhases(
      phases,
      defaults,
      "BY_DISCIPLINE"
    );

    assert.equal(migrated, true);
    assert.equal(next[0]!.volumeProgressionMode, "PERCENT");
    assert.equal(next[0]!.runStartHours, 2);
    assert.equal(next[0]!.runRampPercent, 10);
    assert.equal(next[0]!.runEndHours, 5);
    assert.equal(next[1]!.runStartHours, null);
    assert.equal(next[1]!.runRampPercent, 10);
  });

  it("no-ops when a phase already has volume config", () => {
    const phase = createPhaseAtWeek(0, 1);
    phase.endWeekIndex = 3;
    phase.runStartHours = 3;
    phase.runEndHours = 4;
    const { migrated } = migrateSeasonRampDefaultsOntoPhases(
      [phase],
      defaultSimpleRampDefaults(),
      "BY_DISCIPLINE"
    );
    assert.equal(migrated, false);
  });

  it("ignores unassigned-only phase lists", () => {
    const { migrated } = migrateSeasonRampDefaultsOntoPhases(
      [createEmptyPhase(1)],
      defaultSimpleRampDefaults(),
      "BY_DISCIPLINE"
    );
    assert.equal(migrated, false);
  });
});
