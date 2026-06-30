import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planSessionResolution } from "./session-link";

describe("planSessionResolution", () => {
  it("uses an existing linked session when present", () => {
    const decision = planSessionResolution({
      existingSessionId: "session_linked",
      autoLinkSessionId: "session_other",
    });
    assert.deepEqual(decision, {
      action: "existing",
      sessionId: "session_linked",
    });
  });

  it("auto-links when no existing session but a candidate was linked", () => {
    const decision = planSessionResolution({
      existingSessionId: null,
      autoLinkSessionId: "session_candidate",
    });
    assert.deepEqual(decision, {
      action: "autolink",
      sessionId: "session_candidate",
    });
  });

  it("creates a new session for orphan activities", () => {
    const decision = planSessionResolution({
      existingSessionId: null,
      autoLinkSessionId: null,
    });
    assert.deepEqual(decision, { action: "create" });
  });

  it("prefers existing link over auto-link candidate", () => {
    const decision = planSessionResolution({
      existingSessionId: "session_a",
      autoLinkSessionId: null,
    });
    assert.equal(decision.action, "existing");
    assert.equal(decision.sessionId, "session_a");
  });
});
