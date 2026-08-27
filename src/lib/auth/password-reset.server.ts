import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetUrl,
  emailFromPasswordResetIdentifier,
  hashPasswordResetToken,
  newPasswordResetToken,
  passwordResetEmailContent,
  passwordResetIdentifier,
  passwordResetSecret,
  shouldIssueNewResetToken,
} from "./password-reset";

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const content = passwordResetEmailContent(args.resetUrl);

  if (!apiKey || !from) {
    console.info(
      `[password-reset] Email not configured (set RESEND_API_KEY and EMAIL_FROM). Link for ${args.to}: ${args.resetUrl}`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[password-reset] Resend failed (${res.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[password-reset] Failed to send email", err);
    return false;
  }
}

export async function requestPasswordReset(
  email: string,
  origin: string
): Promise<{ devResetUrl?: string }> {
  const user = await db.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { email: true, passwordHash: true },
  });
  if (!user?.passwordHash) return {};

  const identifier = passwordResetIdentifier(user.email);
  const existing = await db.verificationToken.findMany({
    where: { identifier },
    orderBy: { expires: "desc" },
    take: 1,
  });
  if (!shouldIssueNewResetToken(existing[0]?.expires ?? null)) return {};

  const raw = newPasswordResetToken();
  const token = hashPasswordResetToken(raw, passwordResetSecret());
  const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires } });

  const resetUrl = buildPasswordResetUrl(origin, raw);
  await sendPasswordResetEmail({ to: user.email, resetUrl });
  if (process.env.NODE_ENV !== "production") return { devResetUrl: resetUrl };
  return {};
}

export async function completePasswordReset(
  rawToken: string,
  password: string
): Promise<"ok" | "invalid"> {
  const token = hashPasswordResetToken(rawToken, passwordResetSecret());
  const row = await db.verificationToken.findUnique({ where: { token } });
  if (!row || row.expires.getTime() <= Date.now()) {
    if (row) {
      await db.verificationToken.delete({ where: { token } }).catch(() => undefined);
    }
    return "invalid";
  }

  const email = emailFromPasswordResetIdentifier(row.identifier);
  if (!email) {
    await db.verificationToken.delete({ where: { token } }).catch(() => undefined);
    return "invalid";
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await db.$transaction([
      db.user.update({ where: { email }, data: { passwordHash } }),
      db.verificationToken.deleteMany({ where: { identifier: row.identifier } }),
    ]);
    return "ok";
  } catch {
    await db.verificationToken
      .deleteMany({ where: { identifier: row.identifier } })
      .catch(() => undefined);
    return "invalid";
  }
}
