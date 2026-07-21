import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { targetZoneFromTarget } from "@/lib/workout/workout-tree";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";

describe("targetZoneFromTarget power values", () => {
  const powerOpts = {
    thresholdFtpWatts: 250,
    powerZoneBoundaries: zoneBoundariesFor("BIKE", "POWER"),
  };

  it("maps absolute watts via FTP instead of clamping as zone indices", () => {
    assert.equal(
      targetZoneFromTarget(
        { signal: "power", mode: "value", value: 250 },
        powerOpts
      ),
      4
    );
    assert.equal(
      targetZoneFromTarget(
        { signal: "power", mode: "value", value: 150 },
        powerOpts
      ),
      2
    );
  });

  it("keeps explicit zone mode", () => {
    assert.equal(
      targetZoneFromTarget({ signal: "power", mode: "zone", zone: 3 }, powerOpts),
      3
    );
  });

  it("maps absolute power ranges via midpoint watts", () => {
    assert.equal(
      targetZoneFromTarget(
        { signal: "power", mode: "range", low: 240, high: 260 },
        powerOpts
      ),
      4
    );
  });

  it("does not treat large non-power values as zones", () => {
    assert.equal(
      targetZoneFromTarget({ signal: "pace", mode: "value", value: 300 }),
      2
    );
  });
});
