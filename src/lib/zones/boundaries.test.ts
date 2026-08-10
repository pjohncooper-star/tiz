import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundariesToEditorValues,
  coalesceLegacyZoneBoundaries,
  editorValuesToBoundaries,
  pacePctToSpeedPct,
  speedPctToPacePct,
  validateEditorValues,
  validateZoneBoundaries,
  zoneBoundariesFor,
} from "@/lib/zones/boundaries";
import { assignZoneFromPercent } from "@/lib/zones/assign-zone";
import { parseZoneBoundaries } from "@/lib/zones/parse-boundaries";

describe("pace ↔ speed conversion", () => {
  it("round-trips pace and speed percentages", () => {
    assert.equal(pacePctToSpeedPct(100), 100);
    assert.equal(speedPctToPacePct(100), 100);
    assert.ok(Math.abs(pacePctToSpeedPct(129) - 10000 / 129) < 1e-9);
    assert.ok(Math.abs(speedPctToPacePct(pacePctToSpeedPct(114)) - 114) < 1e-9);
  });
});

describe("zoneBoundariesFor", () => {
  it("uses run pace cutoffs Z1<78, Z2 78–88, Z3 89–94, Z4 95–102, Z5≥102", () => {
    const run = zoneBoundariesFor("RUN", "PACE");
    const power = zoneBoundariesFor("BIKE", "POWER");

    assert.deepEqual(power, [55, 75, 90, 105]);
    assert.deepEqual(run, [78, 89, 95, 102]);
  });
});

describe("assignZoneFromPercent pace", () => {
  it("scores running threshold speed bands per coaching defaults", () => {
    const boundaries = zoneBoundariesFor("RUN", "PACE");
    assert.equal(assignZoneFromPercent(77, boundaries, "PACE"), 1);
    assert.equal(assignZoneFromPercent(78, boundaries, "PACE"), 2);
    assert.equal(assignZoneFromPercent(88, boundaries, "PACE"), 2);
    assert.equal(assignZoneFromPercent(89, boundaries, "PACE"), 3);
    assert.equal(assignZoneFromPercent(94, boundaries, "PACE"), 3);
    assert.equal(assignZoneFromPercent(95, boundaries, "PACE"), 4);
    assert.equal(assignZoneFromPercent(100, boundaries, "PACE"), 4);
    assert.equal(assignZoneFromPercent(102, boundaries, "PACE"), 5);
  });
});

describe("coalesceLegacyZoneBoundaries", () => {
  it("upgrades inverted and interim RUN defaults to coaching cutoffs", () => {
    assert.deepEqual(
      coalesceLegacyZoneBoundaries([77.5, 87.7, 94.3, 100], "RUN"),
      [78, 89, 95, 102]
    );
    assert.deepEqual(
      coalesceLegacyZoneBoundaries([75, 90, 99, 105], "RUN"),
      [78, 89, 95, 102]
    );
    assert.deepEqual(
      parseZoneBoundaries([93.5, 98, 102, 106.4], "SWIM"),
      [75, 90, 99, 105]
    );
  });

  it("does not rewrite BIKE interim defaults when upgrading RUN", () => {
    assert.deepEqual(
      coalesceLegacyZoneBoundaries([75, 90, 99, 105], "BIKE"),
      [75, 90, 99, 105]
    );
  });

  it("leaves custom boundaries unchanged", () => {
    const custom = [70, 85, 95, 110];
    assert.deepEqual(coalesceLegacyZoneBoundaries(custom, "RUN"), custom);
  });

  it("drops the legacy heart-rate cap that scoring already clamped away", () => {
    assert.deepEqual(
      coalesceLegacyZoneBoundaries([68, 83, 94, 100, 106], "RUN"),
      [68, 83, 94, 100]
    );
  });

  it("trims over-specified profiles to the canonical cutoff count", () => {
    // A 7-zone Coggan power profile keeps Z1–Z4 and merges everything above into Z5.
    assert.deepEqual(
      coalesceLegacyZoneBoundaries([55, 75, 90, 105, 120, 150], "BIKE"),
      [55, 75, 90, 105]
    );
  });
});

describe("validateZoneBoundaries", () => {
  it("accepts zoneCount-1 ascending cutoffs", () => {
    assert.equal(validateZoneBoundaries([55, 75, 90, 105], 5), null);
  });

  it("rejects non-increasing cutoffs", () => {
    assert.match(
      validateZoneBoundaries([55, 90, 75, 105], 5) ?? "",
      /increasing/
    );
  });

  it("rejects a trailing cap that would imply a sixth zone", () => {
    assert.match(
      validateZoneBoundaries([68, 83, 94, 100, 106], 5) ?? "",
      /Expected 4 zone boundaries/
    );
  });
});

describe("heart-rate defaults", () => {
  it("defines exactly four cutoffs, matching pace and power", () => {
    for (const discipline of ["BIKE", "RUN", "SWIM"] as const) {
      assert.deepEqual(
        zoneBoundariesFor(discipline, "HEART_RATE"),
        [68, 83, 94, 100]
      );
    }
  });

  it("scores the same bands the clamped five-cutoff profile produced", () => {
    const boundaries = zoneBoundariesFor("RUN", "HEART_RATE");
    assert.equal(assignZoneFromPercent(68, boundaries, "HEART_RATE"), 1);
    assert.equal(assignZoneFromPercent(83, boundaries, "HEART_RATE"), 2);
    assert.equal(assignZoneFromPercent(94, boundaries, "HEART_RATE"), 3);
    assert.equal(assignZoneFromPercent(100, boundaries, "HEART_RATE"), 4);
    assert.equal(assignZoneFromPercent(101, boundaries, "HEART_RATE"), 5);
    assert.equal(assignZoneFromPercent(130, boundaries, "HEART_RATE"), 5);
  });
});

describe("editor pace values", () => {
  it("edits pace cutoffs as ascending % of threshold speed", () => {
    const stored = zoneBoundariesFor("RUN", "PACE");
    const editor = boundariesToEditorValues("PACE", stored);
    assert.deepEqual(editor, [78, 89, 95, 102]);
    assert.deepEqual(editorValuesToBoundaries("PACE", editor), stored);
  });

  it("requires increasing speed cutoffs", () => {
    assert.match(
      validateEditorValues("PACE", [105, 99, 90, 75]) ?? "",
      /increasing/
    );
    assert.equal(validateEditorValues("PACE", [78, 89, 95, 102]), null);
  });
});
