"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

type TrainerRoadSettingsProps = {
  initialUrl: string | null;
  initialSyncedAt: string | null;
};

export function TrainerRoadSettings({
  initialUrl,
  initialSyncedAt,
}: TrainerRoadSettingsProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);
  const [busy, setBusy] = useState<"save" | "sync" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function save(nextUrl: string, mode: "save" | "clear") {
    setBusy(mode);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/trainerroad", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl }),
      });
      const data = (await res.json()) as {
        error?: string;
        url?: string | null;
        syncedAt?: string | null;
        upserted?: number;
        removed?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save TrainerRoad calendar");
        return;
      }
      setUrl(data.url ?? "");
      setSyncedAt(data.syncedAt ?? null);
      if (mode === "clear") {
        setStatus("Disconnected. Future TrainerRoad bike sessions were removed.");
      } else if (typeof data.upserted === "number") {
        setStatus(`Synced ${data.upserted} bike sessions.`);
      } else {
        setStatus("Saved. Sync failed — check the URL and try Sync now.");
      }
    } catch {
      setError("Could not save TrainerRoad calendar");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/trainerroad", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        syncedAt?: string | null;
        upserted?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not sync TrainerRoad calendar");
        return;
      }
      setSyncedAt(data.syncedAt ?? null);
      setStatus(`Synced ${data.upserted ?? 0} bike sessions.`);
    } catch {
      setError("Could not sync TrainerRoad calendar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        Paste the calendar URL from TrainerRoad (Calendar → Subscribe). TiZ imports bike
        sessions as duration plus inferred intensity (Easy / Moderate / Intensity / Long).
        Swim and run stay on your TiZ plan. Season phases are not rewritten yet.
      </p>
      <div>
        <Label>Calendar URL</Label>
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="webcal://api.trainerroad.com/v1/calendar/ics/…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy != null || !url.trim()}
          onClick={() => void save(url, "save")}
        >
          {busy === "save" ? "Saving…" : "Save and sync"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy != null || !url.trim()}
          onClick={() => void syncNow()}
        >
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy != null || (!url.trim() && !syncedAt)}
          onClick={() => void save("", "clear")}
        >
          {busy === "clear" ? "Removing…" : "Disconnect"}
        </Button>
      </div>
      {syncedAt ? (
        <p className="text-xs text-zinc-500">
          Last synced {new Date(syncedAt).toLocaleString()}
        </p>
      ) : null}
      {status ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{status}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
