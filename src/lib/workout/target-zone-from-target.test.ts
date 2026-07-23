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

  it("folds zone-6 into zone-5 when zoneCount is 5", () => {
    assert.equal(
      targetZoneFromTarget(
        { signal: "power", mode: "zone", zone: 6 },
        { ...powerOpts, zoneCount: 5 }
      ),
      5
    );
  });

  it("maps high watts into Z5 when zoneCount is 5 even with 7-zone boundaries", () => {
    assert.equal(
      targetZoneFromTarget(
        { signal: "power", mode: "value", value: 350 },
        {
          thresholdFtpWatts: 250,
          powerZoneBoundaries: [55, 75, 90, 105, 120, 150],
          zoneCount: 5,
        }
      ),
      5
    );
  });

  it("does not treat large non-power values as zones", () => {
    assert.equal(
      targetZoneFromTarget({ signal: "pace", mode: "value", value: 300 }),
      2
    );
  });
});
