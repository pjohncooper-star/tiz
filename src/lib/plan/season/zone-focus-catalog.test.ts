import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { percentsForDisciplineSplit } from "./phase-zone-defaults";
import {
  parseZoneFocusCatalog,
  seedZoneFocusCatalog,
  serializeZoneFocusCatalog,
  validatePhaseKindDefaultsAgainstCatalog,
} from "./zone-focus-catalog";
import { defaultPhaseKindZoneDefaults } from "./phase-zone-defaults";

describe("zone-focus-catalog", () => {
  it("seeds seven default focuses from FOCUS_TIZ_PRESETS", () => {
    const catalog = seedZoneFocusCatalog();
    assert.equal(catalog.length, 7);
    assert.equal(catalog[0]?.id, "AEROBIC_BASE");
    assert.equal(catalog[0]?.percents.z1, 75);
  });

  it("round-trips serialize and parse", () => {
    const catalog = seedZoneFocusCatalog();
    catalog[1] = {
      ...catalog[1]!,
      name: "Sweet spot",
      percents: { z1: 40, z2: 35, z3: 20, z4: 4, z5: 1 },
    };
    const parsed = parseZoneFocusCatalog(serializeZoneFocusCatalog(catalog));
    assert.equal(parsed[1]?.name, "Sweet spot");
    assert.equal(parsed[1]?.percents.z3, 20);
  });

  it("resolves preset percents from catalog", () => {
    const catalog = seedZoneFocusCatalog();
    catalog[1] = {
      ...catalog[1]!,
      percents: { z1: 10, z2: 20, z3: 30, z4: 25, z5: 15 },
    };
    const percents = percentsForDisciplineSplit(
      { mode: "preset", focusId: "THRESHOLD" },
      catalog
    );
    assert.equal(percents.z3, 30);
  });

  it("validates phase-kind defaults reference catalog ids", () => {
    const catalog = seedZoneFocusCatalog();
    const defaults = defaultPhaseKindZoneDefaults();
    assert.doesNotThrow(() =>
      validatePhaseKindDefaultsAgainstCatalog(catalog, defaults)
    );
  });

  it("rejects unknown preset ids in phase-kind defaults", () => {
    const catalog = seedZoneFocusCatalog();
    const defaults = defaultPhaseKindZoneDefaults();
    defaults.BASE.SWIM = { mode: "preset", focusId: "MISSING" };
    assert.throws(() =>
      validatePhaseKindDefaultsAgainstCatalog(catalog, defaults)
    );
  });
});
