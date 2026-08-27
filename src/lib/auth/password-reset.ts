import { createHash, randomBytes } from "crypto";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_MIN_INTERVAL_MS = 60 * 1000;
export const PASSWORD_RESET_IDENTIFIER_PREFIX = "password-reset:";

export function passwordResetIdentifier(email: string): string {
  return `${PASSWORD_RESET_IDENTIFIER_PREFIX}${email}`;
}

export function emailFromPasswordResetIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX)) return null;
  const email = identifier.slice(PASSWORD_RESET_IDENTIFIER_PREFIX.length);
  return email || null;
}

export function passwordResetSecret(): string {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

export function hashPasswordResetToken(rawToken: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${rawToken}`).digest("hex");
}

export function newPasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildPasswordResetUrl(origin: string, rawToken: string): string {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export function shouldIssueNewResetToken(
  existingExpires: Date | null,
  now = new Date()
): boolean {
  if (!existingExpires) return true;
  if (existingExpires.getTime() <= now.getTime()) return true;
  const issuedAt = existingExpires.getTime() - PASSWORD_RESET_TTL_MS;
  return now.getTime() - issuedAt >= PASSWORD_RESET_MIN_INTERVAL_MS;
}

export function passwordResetEmailContent(resetUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  return {
    subject: "Reset your TiZ password",
    text: [
      "We received a request to reset your TiZ password.",
      "",
      "Open this link to choose a new password. It expires in one hour:",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>We received a request to reset your TiZ password.</p>",
      `<p><a href="${resetUrl}">Choose a new password</a></p>`,
      "<p>This link expires in one hour. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}
