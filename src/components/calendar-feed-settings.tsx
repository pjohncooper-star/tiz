"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";

type CalendarFeedSettingsProps = {
  initialToken: string | null;
};

export function CalendarFeedSettings({ initialToken }: CalendarFeedSettingsProps) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const feedUrl = useMemo(() => {
    if (!token || !origin) return "";
    return `${origin}/api/plan/calendar/feed.ics?token=${encodeURIComponent(token)}`;
  }, [origin, token]);

  async function runAction(action: "ensure" | "rotate" | "revoke") {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/settings/calendar-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError("Could not update calendar feed");
        return;
      }
      const data = (await res.json()) as { token?: string | null };
      setToken(data.token ?? null);
    } catch {
      setError("Could not update calendar feed");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      setError("Could not copy URL");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        Subscribe in Apple Calendar, Google Calendar, or Outlook using a private URL.
        Upcoming planned workouts (90 days) are included. Timed sessions use their start
        time; untimed sessions appear as all-day events.
      </p>

      {token && feedUrl ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-500">Subscription URL</label>
          <Input readOnly value={feedUrl} className="font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void copyUrl()}>
              {copied ? "Copied" : "Copy URL"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void runAction("rotate")}
            >
              Regenerate
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void runAction("revoke")}
            >
              Disable
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={busy} onClick={() => void runAction("ensure")}>
          Generate subscription URL
        </Button>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
