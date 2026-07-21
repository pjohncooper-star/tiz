import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignZoneFromPercent,
  zoneFromPowerWatts,
  FALLBACK_FTP_WATTS,
} from "@/lib/zones/assign-zone";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";

describe("zoneFromPowerWatts", () => {
  const boundaries = zoneBoundariesFor("BIKE", "POWER");

  it("maps watts via FTP percent boundaries", () => {
    // FTP 250, boundaries [55,75,90,105]
    assert.equal(
      zoneFromPowerWatts(150, { thresholdFtpWatts: 250, powerZoneBoundaries: boundaries }),
      2
    );
    assert.equal(
      zoneFromPowerWatts(250, { thresholdFtpWatts: 250, powerZoneBoundaries: boundaries }),
      4
    );
  });

  it("uses fallback FTP when omitted", () => {
    // 250W / 200 FTP = 125% → Z5
    assert.equal(zoneFromPowerWatts(250, { powerZoneBoundaries: boundaries }), 5);
    assert.equal(FALLBACK_FTP_WATTS, 200);
  });
});

describe("assignZoneFromPercent", () => {
  it("assigns power zones from percent of FTP", () => {
    const boundaries = [55, 75, 90, 105];
    assert.equal(assignZoneFromPercent(50, boundaries, "POWER"), 1);
    assert.equal(assignZoneFromPercent(75, boundaries, "POWER"), 2);
    assert.equal(assignZoneFromPercent(100, boundaries, "POWER"), 4);
    assert.equal(assignZoneFromPercent(120, boundaries, "POWER"), 5);
  });
});
