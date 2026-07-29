"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONE_COOKIE } from "@/lib/timezone-cookie";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Persist the browser IANA timezone so server pages (dashboard/calendar) can
 * compute "today" correctly on UTC hosts. Refreshes once when the cookie was
 * missing or drifted.
 */
export function TimezoneCookieSync() {
  const router = useRouter();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;

    const current = readCookie(TIMEZONE_COOKIE);
    if (current === tz) return;

    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;

    try {
      if (sessionStorage.getItem("tiz-tz-synced") === tz) return;
      sessionStorage.setItem("tiz-tz-synced", tz);
    } catch {
      // sessionStorage may be unavailable; still set the cookie for next load.
      return;
    }

    router.refresh();
  }, [router]);

  return null;
}
