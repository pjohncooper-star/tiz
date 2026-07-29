import { TIMEZONE_COOKIE } from "@/lib/timezone-cookie";

export { TIMEZONE_COOKIE };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Calendar day key (yyyy-MM-dd) in an IANA timezone. */
export function todayKeyInTimeZone(timeZone: string, now = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return DATE_KEY.test(formatted) ? formatted : now.toISOString().slice(0, 10);
}
