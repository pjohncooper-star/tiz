import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundariesToEditorValues,
  coalesceLegacyPaceBoundaries,
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
  it("stores pace cutoffs as % of threshold speed with Z4 straddling threshold", () => {
    const run = zoneBoundariesFor("RUN", "PACE");
    const swim = zoneBoundariesFor("SWIM", "PACE");
    const bike = zoneBoundariesFor("BIKE", "PACE");
    const power = zoneBoundariesFor("BIKE", "POWER");

    assert.deepEqual(power, [55, 75, 90, 105]);
    assert.deepEqual(run, [75, 90, 99, 105]);
    assert.deepEqual(swim, [75, 90, 99, 105]);
    assert.deepEqual(bike, [75, 90, 99, 105]);
  });
});

describe("assignZoneFromPercent pace", () => {
  it("scores threshold speed as Zone 4, not Zone 5", () => {
    const boundaries = zoneBoundariesFor("RUN", "PACE");
    assert.equal(assignZoneFromPercent(74, boundaries, "PACE"), 1);
    assert.equal(assignZoneFromPercent(80, boundaries, "PACE"), 2);
    assert.equal(assignZoneFromPercent(95, boundaries, "PACE"), 3);
    assert.equal(assignZoneFromPercent(100, boundaries, "PACE"), 4);
    assert.equal(assignZoneFromPercent(103, boundaries, "PACE"), 4);
    assert.equal(assignZoneFromPercent(106, boundaries, "PACE"), 5);
  });
});

describe("coalesceLegacyPaceBoundaries", () => {
  it("upgrades inverted legacy defaults so threshold no longer sits at Z5 floor", () => {
    assert.deepEqual(
      coalesceLegacyPaceBoundaries([77.5, 87.7, 94.3, 100]),
      [75, 90, 99, 105]
    );
    assert.deepEqual(
      coalesceLegacyPaceBoundaries([78, 88, 94, 100]),
      [75, 90, 99, 105]
    );
    assert.deepEqual(
      parseZoneBoundaries([93.5, 98, 102, 106.4]),
      [75, 90, 99, 105]
    );
  });

  it("leaves custom boundaries unchanged", () => {
    const custom = [70, 85, 95, 110];
    assert.deepEqual(coalesceLegacyPaceBoundaries(custom), custom);
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
});

describe("editor pace values", () => {
  it("edits pace cutoffs as ascending % of threshold speed", () => {
    const stored = zoneBoundariesFor("RUN", "PACE");
    const editor = boundariesToEditorValues("PACE", stored);
    assert.deepEqual(editor, [75, 90, 99, 105]);
    assert.deepEqual(editorValuesToBoundaries("PACE", editor), stored);
  });

  it("requires increasing speed cutoffs", () => {
    assert.match(
      validateEditorValues("PACE", [105, 99, 90, 75]) ?? "",
      /increasing/
    );
    assert.equal(validateEditorValues("PACE", [75, 90, 99, 105]), null);
  });
});
