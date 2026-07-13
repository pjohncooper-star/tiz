import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundariesToEditorValues,
  editorValuesToBoundaries,
  pacePctToSpeedPct,
  speedPctToPacePct,
  validateEditorValues,
  validateZoneBoundaries,
  zoneBoundariesFor,
} from "@/lib/zones/boundaries";

describe("pace ↔ speed conversion", () => {
  it("round-trips pace and speed percentages", () => {
    assert.equal(pacePctToSpeedPct(100), 100);
    assert.equal(speedPctToPacePct(100), 100);
    assert.ok(Math.abs(pacePctToSpeedPct(129) - 10000 / 129) < 1e-9);
    assert.ok(Math.abs(speedPctToPacePct(pacePctToSpeedPct(114)) - 114) < 1e-9);
  });
});

describe("zoneBoundariesFor", () => {
  it("keys defaults by discipline and signal", () => {
    const run = zoneBoundariesFor("RUN", "PACE");
    const swim = zoneBoundariesFor("SWIM", "PACE");
    const power = zoneBoundariesFor("BIKE", "POWER");

    assert.deepEqual(power, [55, 75, 90, 105]);
    assert.notDeepEqual(run, swim);
    assert.equal(run.length, 4);
    assert.equal(swim.length, 4);
    // Run Z1 top ~129% pace → ~77.5 speed
    assert.ok(run[0] > 77 && run[0] < 78);
    assert.equal(run[3], 100);
    // Swim Z1 top ~107% pace → ~93.5 speed
    assert.ok(swim[0] > 93 && swim[0] < 94);
    assert.ok(swim[3] > 106 && swim[3] < 107);
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
  it("converts stored speed % to descending pace % for editing", () => {
    const stored = zoneBoundariesFor("RUN", "PACE");
    const editor = boundariesToEditorValues("PACE", stored);
    assert.equal(editor.length, 4);
    assert.ok(editor[0] > editor[1]);
    assert.ok(Math.abs(editor[0] - 129) < 0.2);
    assert.equal(editor[3], 100);
  });

  it("round-trips editor values back to stored speed %", () => {
    const stored = zoneBoundariesFor("SWIM", "PACE");
    const editor = boundariesToEditorValues("PACE", stored);
    const back = editorValuesToBoundaries("PACE", editor);
    assert.deepEqual(back, stored);
  });

  it("requires decreasing pace cutoffs", () => {
    assert.match(
      validateEditorValues("PACE", [100, 110, 120, 130]) ?? "",
      /decrease/
    );
    assert.equal(validateEditorValues("PACE", [129, 114, 106, 100]), null);
  });
});
