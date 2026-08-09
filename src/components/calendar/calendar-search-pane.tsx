"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NumberEditorInput } from "@/components/number-editor-input";
import { WorkoutTagsInput } from "@/components/workout-tags-input";
import { Button, Input, Label, Select } from "@/components/ui";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { TrainingSearchHit } from "@/lib/plan/search";
import type { DisplayUnit } from "@/lib/workout/metrics";
import { formatSessionDistance } from "@/lib/workout/metrics";
import type { Discipline } from "@prisma/client";

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;

type CalendarSearchPaneProps = {
  open: boolean;
  onClose: () => void;
  onJumpToDate: (dateKey: string) => void;
  displayUnit: DisplayUnit;
};

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function CalendarSearchPane({
  open,
  onClose,
  onJumpToDate,
  displayUnit,
}: CalendarSearchPaneProps) {
  const [q, setQ] = useState("");
  const [discipline, setDiscipline] = useState<"" | Discipline>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minDuration, setMinDuration] = useState<number | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [minDistanceDisplay, setMinDistanceDisplay] = useState<number | null>(null);
  const [maxDistanceDisplay, setMaxDistanceDisplay] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<TrainingSearchHit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const distanceLabel = displayUnit === "IMPERIAL" ? "mi" : "km";
  const toMeters = useMemo(
    () => (value: number | null) => {
      if (value == null) return undefined;
      return displayUnit === "IMPERIAL" ? value * METERS_PER_MILE : value * METERS_PER_KM;
    },
    [displayUnit]
  );

  function buildParams(cursor?: string | null): URLSearchParams {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (discipline) params.set("discipline", discipline);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (minDuration != null) params.set("minDurationMinutes", String(minDuration));
    if (maxDuration != null) params.set("maxDurationMinutes", String(maxDuration));
    const minM = toMeters(minDistanceDisplay);
    const maxM = toMeters(maxDistanceDisplay);
    if (minM != null) params.set("minDistanceMeters", String(minM));
    if (maxM != null) params.set("maxDistanceMeters", String(maxM));
    if (tags.length > 0) params.set("tags", tags.join(","));
    params.set("limit", "40");
    if (cursor) params.set("cursor", cursor);
    return params;
  }

  async function runSearch(mode: "replace" | "append") {
    setLoading(true);
    setError(null);
    try {
      const cursor = mode === "append" ? nextCursor : null;
      const res = await fetch(`/api/plan/search?${buildParams(cursor).toString()}`);
      if (!res.ok) {
        setError("Search failed");
        return;
      }
      const data = (await res.json()) as {
        results?: TrainingSearchHit[];
        nextCursor?: string | null;
      };
      const page = data.results ?? [];
      setResults((prev) => (mode === "append" ? [...prev, ...page] : page));
      setNextCursor(data.nextCursor ?? null);
      setSearched(true);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Search training history
        </h2>
        <Button type="button" variant="secondary" className="px-2.5 py-1" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-2">
          <Label>Title</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch("replace");
              }
            }}
          />
        </div>
        <div>
          <Label>Discipline</Label>
          <Select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value as "" | Discipline)}
          >
            <option value="">Any</option>
            {(Object.keys(DISCIPLINE_DISPLAY_LABELS) as Discipline[]).map((d) => (
              <option key={d} value={d}>
                {DISCIPLINE_DISPLAY_LABELS[d]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberEditorInput
            label="Min duration (min)"
            value={minDuration}
            onCommit={setMinDuration}
            nullable
            min={0}
          />
          <NumberEditorInput
            label="Max duration (min)"
            value={maxDuration}
            onCommit={setMaxDuration}
            nullable
            min={0}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberEditorInput
            label={`Min distance (${distanceLabel})`}
            value={minDistanceDisplay}
            onCommit={setMinDistanceDisplay}
            nullable
            integer={false}
            min={0}
          />
          <NumberEditorInput
            label={`Max distance (${distanceLabel})`}
            value={maxDistanceDisplay}
            onCommit={setMaxDistanceDisplay}
            nullable
            integer={false}
            min={0}
          />
        </div>
        <div className="md:col-span-2 xl:col-span-2">
          <WorkoutTagsInput value={tags} onChange={setTags} label="Tags (all must match)" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={loading} onClick={() => void runSearch("replace")}>
          {loading && !searched ? "Searching…" : "Search"}
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="mt-4 max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto">
        {!searched ? (
          <p className="text-sm text-zinc-500">
            Search planned sessions and imported activities across your full history.
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-zinc-500">No matching workouts.</p>
        ) : (
          results.map((hit) => {
            const distance = formatSessionDistance(
              hit.distanceMeters,
              hit.discipline,
              displayUnit
            );
            return (
              <div
                key={`${hit.kind}:${hit.id}`}
                className="flex flex-col gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {hit.title}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {hit.dateKey} · {DISCIPLINE_DISPLAY_LABELS[hit.discipline]} ·{" "}
                    {formatDuration(hit.durationMinutes)}
                    {distance ? ` · ${distance}` : ""}
                    {hit.kind === "activity" ? " · activity" : ""}
                    {hit.tags.length > 0 ? ` · ${hit.tags.join(", ")}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-2.5 py-1"
                    onClick={() => {
                      onJumpToDate(hit.dateKey);
                      onClose();
                    }}
                  >
                    Open week
                  </Button>
                  <Link href={hit.detailHref}>
                    <Button type="button" variant="secondary" className="px-2.5 py-1">
                      Details
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {nextCursor ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void runSearch("append")}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
