import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedPrimarySignals,
  deriveFallbackSignal,
  formatRoleSignalSummary,
  normalizeRoleSignals,
  parseRoleSignals,
  preferenceSnapshot,
  resolvePrimarySignalForSession,
  resolveSignalForRole,
  resolveSignalForSession,
  roleSignalsEqual,
  signalTypeToTargetSignal,
  signalTypeToTargetView,
  validatePrimarySignal,
  validateRoleSignals,
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
      roleSignals: {},
    });
  });

  it("signalTypeToTargetView and signalTypeToTargetSignal", () => {
    assert.equal(signalTypeToTargetView("HEART_RATE"), "heart_rate");
    assert.equal(signalTypeToTargetView("POWER"), "pace_power");
    assert.equal(signalTypeToTargetSignal("PACE"), "pace");
    assert.equal(signalTypeToTargetSignal("POWER"), "power");
  });

  it("parseRoleSignals keeps valid sparse map", () => {
    assert.deepEqual(
      parseRoleSignals({ EASY: "HEART_RATE", INTENSITY: "PACE", BOGUS: "PACE" }),
      { EASY: "HEART_RATE", INTENSITY: "PACE" }
    );
    assert.deepEqual(parseRoleSignals(null), {});
    assert.deepEqual(parseRoleSignals("nope"), {});
  });

  it("normalizeRoleSignals drops overrides equal to primary", () => {
    assert.deepEqual(
      normalizeRoleSignals("PACE", {
        EASY: "HEART_RATE",
        INTENSITY: "PACE",
        LONG: "HEART_RATE",
      }),
      { EASY: "HEART_RATE", LONG: "HEART_RATE" }
    );
  });

  it("validateRoleSignals rejects invalid signals for discipline", () => {
    assert.throws(() => validateRoleSignals("RUN", { EASY: "POWER" }));
    assert.doesNotThrow(() =>
      validateRoleSignals("RUN", { EASY: "HEART_RATE", INTENSITY: "PACE" })
    );
  });

  it("resolveSignalForRole inherits primary unless overridden", () => {
    const snapshot = preferenceSnapshot("RUN", "PACE", {
      EASY: "HEART_RATE",
      INTENSITY: "PACE",
    });
    assert.deepEqual(resolveSignalForRole("RUN", snapshot, "EASY"), {
      primarySignal: "HEART_RATE",
      fallbackSignal: "PACE",
    });
    assert.deepEqual(resolveSignalForRole("RUN", snapshot, "MODERATE"), {
      primarySignal: "PACE",
      fallbackSignal: "HEART_RATE",
    });
    assert.deepEqual(resolveSignalForRole("RUN", snapshot, "INTENSITY"), {
      primarySignal: "PACE",
      fallbackSignal: "HEART_RATE",
    });
    assert.deepEqual(resolveSignalForRole("RUN", snapshot, null), {
      primarySignal: "PACE",
      fallbackSignal: "HEART_RATE",
    });
  });

  it("resolvePrimarySignalForSession follows role overrides", () => {
    const snapshot = preferenceSnapshot("RUN", "PACE", {
      EASY: "HEART_RATE",
      INTENSITY: "PACE",
    });
    assert.equal(resolvePrimarySignalForSession("RUN", snapshot, "EASY"), "HEART_RATE");
    assert.equal(resolvePrimarySignalForSession("RUN", snapshot, "MODERATE"), "PACE");
    assert.equal(resolvePrimarySignalForSession("RUN", snapshot, "INTENSITY"), "PACE");
    assert.equal(resolvePrimarySignalForSession("RUN", snapshot, null), "PACE");
  });

  it("session override beats role override", () => {
    const snapshot = preferenceSnapshot("RUN", "PACE", { EASY: "HEART_RATE" });
    assert.equal(
      resolvePrimarySignalForSession("RUN", snapshot, "EASY", "PACE"),
      "PACE"
    );
    assert.deepEqual(
      resolveSignalForSession("RUN", snapshot, {
        sessionRole: "EASY",
        tizSignalOverride: "PACE",
      }),
      { primarySignal: "PACE", fallbackSignal: "HEART_RATE" }
    );
    assert.equal(
      resolvePrimarySignalForSession("RUN", snapshot, "EASY", null),
      "HEART_RATE"
    );
  });

  it("roleSignalsEqual and formatRoleSignalSummary", () => {
    assert.equal(
      roleSignalsEqual({ EASY: "HEART_RATE" }, { EASY: "HEART_RATE" }),
      true
    );
    assert.equal(
      roleSignalsEqual({ EASY: "HEART_RATE" }, { EASY: "PACE" }),
      false
    );
    assert.equal(
      formatRoleSignalSummary("PACE", { EASY: "HEART_RATE", INTENSITY: "PACE" }, (s) =>
        s === "HEART_RATE" ? "Heart rate" : "Pace"
      ),
      "Easy Heart rate"
    );
    assert.equal(formatRoleSignalSummary("PACE", {}, (s) => s), null);
  });
});
