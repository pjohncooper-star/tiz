import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSessionTargetZones } from "@/lib/plan/session-target-zones";

describe("buildSessionTargetZones", () => {
  it("trims zones when total exceeds duration", () => {
    const zones = buildSessionTargetZones({ 2: 30, 3: 30 }, 45);
    const total = Object.values(zones).reduce((sum, minutes) => sum + minutes, 0);
    assert.equal(total, 45);
  });

  it("pads zone 1 when duration exceeds zone total", () => {
    const zones = buildSessionTargetZones({ 2: 20 }, 45);
    assert.equal(zones["1"], 25);
    assert.equal(zones["2"], 20);
  });

  it("creates zone 1 budget from duration when zones are empty", () => {
    const zones = buildSessionTargetZones({}, 45);
    assert.deepEqual(zones, { "1": 45 });
  });
});
