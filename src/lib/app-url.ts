/** App origin for redirects and OAuth. Prefer request origin in route handlers. */
export function getAppUrl(req?: Request): string {
  if (req) return new URL(req.url).origin;
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}
