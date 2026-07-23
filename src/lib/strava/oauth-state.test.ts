import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeStravaOAuthState,
  encodeStravaOAuthState,
  parseStravaOAuthState,
  safeReturnPath,
} from "./oauth-state";

describe("safeReturnPath", () => {
  it("allows relative paths", () => {
    assert.equal(safeReturnPath("/settings"), "/settings");
  });

  it("rejects external URLs", () => {
    assert.equal(safeReturnPath("//evil.com"), "/dashboard");
    assert.equal(safeReturnPath("https://evil.com"), "/dashboard");
  });
});

describe("Strava OAuth state", () => {
  it("round-trips athleteId and returnTo", () => {
    const encoded = encodeStravaOAuthState({
      athleteId: "athlete_1",
      returnTo: "/settings",
    });
    assert.deepEqual(decodeStravaOAuthState(encoded), {
      athleteId: "athlete_1",
      returnTo: "/settings",
    });
  });

  it("parses legacy raw athleteId state", () => {
    assert.deepEqual(parseStravaOAuthState("clxyz123"), {
      athleteId: "clxyz123",
      returnTo: "/dashboard",
    });
  });
});
