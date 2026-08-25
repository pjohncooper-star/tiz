"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

type LinkedSeason = { id: string; name: string };

type Overlap = { id: string; name: string; startDate: string; endDate: string };

type TrainerRoadSettingsProps = {
  initialUrl: string | null;
  initialSyncedAt: string | null;
  initialSeason: LinkedSeason | null;
};

export function TrainerRoadSettings({
  initialUrl,
  initialSyncedAt,
  initialSeason,
}: TrainerRoadSettingsProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);
  const [season, setSeason] = useState<LinkedSeason | null>(initialSeason);
  const [phaseCount, setPhaseCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"save" | "sync" | "clear" | "season" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<Overlap[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  function applySeasonFromSync(data: {
    season?: {
      updated?: boolean;
      id?: string;
      name?: string;
      error?: string;
      overlapping?: Overlap[];
    };
    phaseCount?: number;
  }) {
    if (typeof data.phaseCount === "number") setPhaseCount(data.phaseCount);
    if (data.season?.id && data.season.name) {
      setSeason({ id: data.season.id, name: data.season.name });
    }
    if (data.season?.overlapping?.length) {
      setOverlaps(data.season.overlapping);
    }
    if (data.season?.error) {
      setError(data.season.error);
    }
  }

  async function save(nextUrl: string, mode: "save" | "clear") {
    setBusy(mode);
    setError(null);
    setStatus(null);
    setOverlaps([]);
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
        phaseCount?: number;
        season?: {
          updated?: boolean;
          id?: string;
          name?: string;
          error?: string;
          overlapping?: Overlap[];
        };
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save TrainerRoad calendar");
        return;
      }
      setUrl(data.url ?? "");
      setSyncedAt(data.syncedAt ?? null);
      if (mode === "clear") {
        setSeason(null);
        setPhaseCount(null);
        setStatus("Disconnected. Future TrainerRoad bike sessions were removed. The season was kept.");
      } else if (typeof data.upserted === "number") {
        setStatus(`Synced ${data.upserted} bike sessions.`);
        applySeasonFromSync(data);
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
    setOverlaps([]);
    try {
      const res = await fetch("/api/settings/trainerroad", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        syncedAt?: string | null;
        upserted?: number;
        phaseCount?: number;
        season?: {
          updated?: boolean;
          id?: string;
          name?: string;
          error?: string;
          overlapping?: Overlap[];
        };
      };
      if (!res.ok) {
        setError(data.error ?? "Could not sync TrainerRoad calendar");
        return;
      }
      setSyncedAt(data.syncedAt ?? null);
      setStatus(`Synced ${data.upserted ?? 0} bike sessions.`);
      applySeasonFromSync(data);
    } catch {
      setError("Could not sync TrainerRoad calendar");
    } finally {
      setBusy(null);
    }
  }

  async function createSeason() {
    setBusy("season");
    setError(null);
    setStatus(null);
    setOverlaps([]);
    try {
      const res = await fetch("/api/settings/trainerroad/season", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        id?: string;
        name?: string;
        phaseCount?: number;
        alreadyLinked?: boolean;
        overlapping?: Overlap[];
      };
      if (res.status === 409) {
        setOverlaps(data.overlapping ?? []);
        setError(
          data.error ??
            "An existing season overlaps these dates. Archive or shorten it on Seasons, then try again."
        );
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not create TrainerRoad season");
        return;
      }
      if (data.id && data.name) setSeason({ id: data.id, name: data.name });
      if (typeof data.phaseCount === "number") setPhaseCount(data.phaseCount);
      setStatus(
        data.alreadyLinked
          ? `Season “${data.name}” already follows this calendar.`
          : `Created season “${data.name}” from TrainerRoad phases.`
      );
    } catch {
      setError("Could not create TrainerRoad season");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        Paste the calendar URL from TrainerRoad (Calendar → Subscribe). TiZ imports bike
        sessions as duration plus inferred intensity (Easy / Moderate / Intensity / Long).
        You can then create a dedicated season whose phases follow the feed. Swim and run
        stay on your TiZ plan; bike workouts stay on TrainerRoad.
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
          {phaseCount != null ? ` · ${phaseCount} phase markers` : ""}
        </p>
      ) : null}
      {season ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Season “{season.name}” follows this calendar. Later syncs update its phases.
        </p>
      ) : syncedAt ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy != null}
            onClick={() => void createSeason()}
          >
            {busy === "season" ? "Creating…" : "Create season from TrainerRoad"}
          </Button>
        </div>
      ) : null}
      {overlaps.length > 0 ? (
        <div className="text-xs text-red-600">
          <p>Overlapping seasons — archive or shorten them on Seasons first:</p>
          <ul className="mt-1 list-disc pl-5">
            {overlaps.map((row) => (
              <li key={row.id}>
                {row.name} ({row.startDate} → {row.endDate})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {status ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{status}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
