import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phaseKindZoneDefaultsSchema } from "@/lib/plan/api-schemas";
import {
  defaultPhaseKindZoneDefaults,
  parsePhaseKindZoneDefaults,
  resolvePhaseKindZoneDefaultsForNewSeason,
  serializePhaseKindZoneDefaults,
} from "./phase-zone-defaults";

describe("phase-zone-defaults athlete defaults", () => {
  it("parses null athlete storage as code defaults", () => {
    const parsed = parsePhaseKindZoneDefaults(null);
    assert.deepEqual(parsed, defaultPhaseKindZoneDefaults());
  });

  it("round-trips serialize and parse", () => {
    const custom = defaultPhaseKindZoneDefaults();
    custom.BUILD = {
      SWIM: { mode: "custom", percents: { z1: 10, z2: 20, z3: 30, z4: 25, z5: 15 } },
      BIKE: { mode: "preset", focus: "THRESHOLD" },
      RUN: { mode: "preset", focus: "VO2_MAX" },
    };

    const stored = serializePhaseKindZoneDefaults(custom);
    const parsed = parsePhaseKindZoneDefaults(stored);

    assert.equal(parsed.BUILD.SWIM.mode, "custom");
    assert.equal(parsed.BUILD.SWIM.percents?.z3, 30);
    assert.equal(parsed.BUILD.BIKE.focus, "THRESHOLD");
    assert.equal(parsed.BUILD.RUN.focus, "VO2_MAX");
  });

  it("validates athlete defaults for settings save", () => {
    const defaults = defaultPhaseKindZoneDefaults();
    const result = phaseKindZoneDefaultsSchema.safeParse(defaults);
    assert.equal(result.success, true);
  });

  it("rejects invalid athlete defaults", () => {
    const result = phaseKindZoneDefaultsSchema.safeParse({
      BASE: { SWIM: { mode: "invalid" }, BIKE: {}, RUN: {} },
    });
    assert.equal(result.success, false);
  });

  it("seeds new seasons from athlete defaults when explicit defaults omitted", () => {
    const athleteStored = serializePhaseKindZoneDefaults({
      ...defaultPhaseKindZoneDefaults(),
      TAPER: {
        SWIM: { mode: "preset", focus: "MAINTENANCE" },
        BIKE: { mode: "preset", focus: "MAINTENANCE" },
        RUN: { mode: "preset", focus: "MAINTENANCE" },
      },
    });

    const resolved = resolvePhaseKindZoneDefaultsForNewSeason(undefined, athleteStored);
    assert.equal(resolved.TAPER.SWIM.focus, "MAINTENANCE");
    assert.equal(resolved.BASE.SWIM.focus, defaultPhaseKindZoneDefaults().BASE.SWIM.focus);
  });

  it("prefers explicit defaults over athlete storage when creating a season", () => {
    const athleteStored = serializePhaseKindZoneDefaults({
      ...defaultPhaseKindZoneDefaults(),
      BUILD: {
        SWIM: { mode: "preset", focus: "MAINTENANCE" },
        BIKE: { mode: "preset", focus: "MAINTENANCE" },
        RUN: { mode: "preset", focus: "MAINTENANCE" },
      },
    });
    const explicit = defaultPhaseKindZoneDefaults();
    explicit.BUILD = {
      SWIM: { mode: "preset", focus: "VO2_MAX" },
      BIKE: { mode: "preset", focus: "VO2_MAX" },
      RUN: { mode: "preset", focus: "VO2_MAX" },
    };

    const resolved = resolvePhaseKindZoneDefaultsForNewSeason(explicit, athleteStored);
    assert.equal(resolved.BUILD.SWIM.focus, "VO2_MAX");
  });
});
