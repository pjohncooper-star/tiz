import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetUrl,
  emailFromPasswordResetIdentifier,
  hashPasswordResetToken,
  passwordResetEmailContent,
  passwordResetIdentifier,
  shouldIssueNewResetToken,
} from "./password-reset";

describe("passwordResetIdentifier", () => {
  it("round-trips the email", () => {
    const identifier = passwordResetIdentifier("athlete@example.com");
    assert.equal(emailFromPasswordResetIdentifier(identifier), "athlete@example.com");
  });

  it("rejects other verification tokens", () => {
    assert.equal(emailFromPasswordResetIdentifier("athlete@example.com"), null);
    assert.equal(emailFromPasswordResetIdentifier(""), null);
  });
});

describe("hashPasswordResetToken", () => {
  it("is deterministic and secret-dependent", () => {
    const a = hashPasswordResetToken("token-one", "secret-a");
    const b = hashPasswordResetToken("token-one", "secret-a");
    const c = hashPasswordResetToken("token-two", "secret-a");
    const d = hashPasswordResetToken("token-one", "secret-b");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
    assert.match(a, /^[0-9a-f]{64}$/);
  });
});

describe("buildPasswordResetUrl", () => {
  it("puts the raw token on /reset-password", () => {
    assert.equal(
      buildPasswordResetUrl("https://www.tizplanner.com", "abc+token"),
      "https://www.tizplanner.com/reset-password?token=abc%2Btoken"
    );
  });
});

describe("shouldIssueNewResetToken", () => {
  const now = new Date("2026-08-26T16:00:00.000Z");

  it("issues when none exists or the previous token expired", () => {
    assert.equal(shouldIssueNewResetToken(null, now), true);
    assert.equal(
      shouldIssueNewResetToken(new Date("2026-08-26T15:59:00.000Z"), now),
      true
    );
  });

  it("waits out the cooldown after a fresh token", () => {
    const fresh = new Date(now.getTime() + PASSWORD_RESET_TTL_MS - 10_000);
    assert.equal(shouldIssueNewResetToken(fresh, now), false);
  });

  it("allows another send after the cooldown", () => {
    const aged = new Date(now.getTime() + PASSWORD_RESET_TTL_MS - 120_000);
    assert.equal(shouldIssueNewResetToken(aged, now), true);
  });
});

describe("passwordResetEmailContent", () => {
  it("includes the reset URL", () => {
    const url = "https://www.tizplanner.com/reset-password?token=abc";
    const content = passwordResetEmailContent(url);
    assert.equal(content.subject, "Reset your TiZ password");
    assert.ok(content.text.includes(url));
    assert.ok(content.html.includes(url));
  });
});
