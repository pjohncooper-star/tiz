import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedPrimarySignals,
  deriveFallbackSignal,
  preferenceSnapshot,
  signalTypeToTargetSignal,
  signalTypeToTargetView,
  validatePrimarySignal,
} from "./signal-preference";

describe("signal-preference", () => {
  it("allowedPrimarySignals for bike and run", () => {
    assert.deepEqual(allowedPrimarySignals("BIKE"), ["POWER", "HEART_RATE"]);
    assert.deepEqual(allowedPrimarySignals("RUN"), ["PACE", "HEART_RATE"]);
    assert.deepEqual(allowedPrimarySignals("SWIM"), ["PACE"]);
  });

  it("deriveFallbackSignal pairs", () => {
    assert.equal(deriveFallbackSignal("BIKE", "POWER"), "HEART_RATE");
    assert.equal(deriveFallbackSignal("BIKE", "HEART_RATE"), "POWER");
    assert.equal(deriveFallbackSignal("RUN", "PACE"), "HEART_RATE");
    assert.equal(deriveFallbackSignal("RUN", "HEART_RATE"), "PACE");
    assert.equal(deriveFallbackSignal("SWIM", "PACE"), null);
  });

  it("validatePrimarySignal rejects invalid pairings", () => {
    assert.throws(() => validatePrimarySignal("BIKE", "PACE"));
    assert.throws(() => validatePrimarySignal("RUN", "POWER"));
    assert.doesNotThrow(() => validatePrimarySignal("BIKE", "POWER"));
    assert.doesNotThrow(() => validatePrimarySignal("RUN", "HEART_RATE"));
  });

  it("preferenceSnapshot builds fallback", () => {
    assert.deepEqual(preferenceSnapshot("BIKE", "HEART_RATE"), {
      primarySignal: "HEART_RATE",
      fallbackSignal: "POWER",
    });
  });

  it("signalTypeToTargetView and signalTypeToTargetSignal", () => {
    assert.equal(signalTypeToTargetView("HEART_RATE"), "heart_rate");
    assert.equal(signalTypeToTargetView("POWER"), "pace_power");
    assert.equal(signalTypeToTargetSignal("PACE"), "pace");
    assert.equal(signalTypeToTargetSignal("POWER"), "power");
  });
});
