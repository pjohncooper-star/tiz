import { cookies, headers } from "next/headers";
import { TIMEZONE_COOKIE } from "@/lib/timezone-cookie";
import { isValidTimeZone, todayKeyInTimeZone } from "@/lib/timezone-format";

export { TIMEZONE_COOKIE, isValidTimeZone, todayKeyInTimeZone };

/**
 * Prefer the browser timezone cookie, then Vercel's IP timezone hint, then UTC.
 * Server runtimes (e.g. Vercel) are UTC — never use process-local getDate() for "today".
 */
export async function resolveRequestTimeZone(): Promise<string> {
  const jar = await cookies();
  const fromCookie = jar.get(TIMEZONE_COOKIE)?.value;
  if (fromCookie) {
    const decoded = decodeURIComponent(fromCookie);
    if (isValidTimeZone(decoded)) return decoded;
  }

  const hdrs = await headers();
  const fromVercel = hdrs.get("x-vercel-ip-timezone");
  if (fromVercel && isValidTimeZone(fromVercel)) return fromVercel;

  return "UTC";
}

export async function requestTodayKey(now = new Date()): Promise<string> {
  return todayKeyInTimeZone(await resolveRequestTimeZone(), now);
}
